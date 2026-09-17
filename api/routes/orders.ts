import { Router, type Request, type Response } from 'express'
import db from '../db/index.js'
import {
  withTransaction,
  expirePendingOffers,
} from '../db/index.js'
import { authenticateToken, type AuthRequest } from '../middleware/auth.js'

const router = Router()

/** 普通购买下单 */
router.post(
  '/',
  authenticateToken,
  async (req: AuthRequest, res: Response): Promise<void> => {
    try {
      const { product_id, type, price } = req.body

      if (!product_id || !type) {
        res.status(400).json({ success: false, error: '参数不完整' })
        return
      }

      if (type === 'exchange') {
        res.status(400).json({
          success: false,
          error: '交换订单需由卖家接受交换报价后生成，请先发起交换请求',
        })
        return
      }

      const product: any = db
        .prepare('SELECT * FROM products WHERE id = ?')
        .get(product_id)

      if (!product) {
        res.status(404).json({ success: false, error: '商品不存在' })
        return
      }

      if (product.seller_id === req.user?.id) {
        res.status(400).json({ success: false, error: '不能购买自己的商品' })
        return
      }

      try {
        const order = withTransaction(() => {
          // 事务内重新读取，避免并发下商品已被交换锁定
          const target: any = db
            .prepare('SELECT * FROM products WHERE id = ?')
            .get(product_id)

          if (target.status !== 'active') {
            throw Object.assign(new Error('商品不可用'), { statusCode: 400 })
          }

          const result = db
            .prepare(
              `
            INSERT INTO orders (product_id, buyer_id, seller_id, price, type, status)
            VALUES (?, ?, ?, ?, ?, 'pending')
          `,
            )
            .run(
              product_id,
              req.user?.id,
              target.seller_id,
              price || target.price,
              type,
            )

          db.prepare('UPDATE products SET status = ? WHERE id = ?').run(
            'sold',
            product_id,
          )

          // 商品被买走，针对它的待处理交换报价全部失效，且不可复活
          expirePendingOffers([product_id])

          return db.prepare('SELECT * FROM orders WHERE id = ?').get(result.lastInsertRowid)
        })

        res.status(201).json({ success: true, data: order })
      } catch (e: any) {
        if (e.statusCode) {
          res.status(e.statusCode).json({ success: false, error: e.message })
          return
        }
        throw e
      }
    } catch (error) {
      console.error(error)
      res.status(500).json({ success: false, error: '创建订单失败' })
    }
  },
)

/** 解析订单查询中的商品照片 */
function parseOrderPhotos(o: any) {
  return {
    ...o,
    photos: o.photos ? JSON.parse(o.photos) : [],
    offered_photos: o.offered_photos ? JSON.parse(o.offered_photos) : [],
  }
}

router.get(
  '/buyer',
  authenticateToken,
  async (req: AuthRequest, res: Response): Promise<void> => {
    try {
      const orders = db
        .prepare(
          `
        SELECT o.*, p.name as product_name, p.photos,
               op.name as offered_product_name, op.photos as offered_photos,
               u.username as seller_name
        FROM orders o
        JOIN products p ON o.product_id = p.id
        JOIN users u ON o.seller_id = u.id
        LEFT JOIN products op ON o.offered_product_id = op.id
        WHERE o.buyer_id = ?
        ORDER BY o.created_at DESC
      `,
        )
        .all(req.user?.id)

      res.json({ success: true, data: (orders as any[]).map(parseOrderPhotos) })
    } catch (error) {
      console.error(error)
      res.status(500).json({ success: false, error: '获取订单失败' })
    }
  },
)

router.get(
  '/seller',
  authenticateToken,
  async (req: AuthRequest, res: Response): Promise<void> => {
    try {
      const orders = db
        .prepare(
          `
        SELECT o.*, p.name as product_name, p.photos,
               op.name as offered_product_name, op.photos as offered_photos,
               u.username as buyer_name
        FROM orders o
        JOIN products p ON o.product_id = p.id
        JOIN users u ON o.buyer_id = u.id
        LEFT JOIN products op ON o.offered_product_id = op.id
        WHERE o.seller_id = ?
        ORDER BY o.created_at DESC
      `,
        )
        .all(req.user?.id)

      res.json({ success: true, data: (orders as any[]).map(parseOrderPhotos) })
    } catch (error) {
      console.error(error)
      res.status(500).json({ success: false, error: '获取订单失败' })
    }
  },
)

router.put(
  '/:id/ship',
  authenticateToken,
  async (req: AuthRequest, res: Response): Promise<void> => {
    try {
      const { id } = req.params

      const order: any = db
        .prepare('SELECT * FROM orders WHERE id = ?')
        .get(id)

      if (!order) {
        res.status(404).json({ success: false, error: '订单不存在' })
        return
      }

      if (order.seller_id !== req.user?.id) {
        res.status(403).json({ success: false, error: '无权限操作' })
        return
      }

      if (order.status !== 'pending') {
        res
          .status(400)
          .json({
            success: false,
            error:
              order.status === 'cancelled'
                ? '订单已取消，无法发货'
                : '订单状态不正确，无法发货',
          })
        return
      }

      db.prepare('UPDATE orders SET status = ? WHERE id = ?').run(
        'shipped',
        id,
      )

      res.json({ success: true, message: '发货成功' })
    } catch (error) {
      console.error(error)
      res.status(500).json({ success: false, error: '发货失败' })
    }
  },
)

router.put(
  '/:id/receive',
  authenticateToken,
  async (req: AuthRequest, res: Response): Promise<void> => {
    try {
      const { id } = req.params

      const order: any = db
        .prepare('SELECT * FROM orders WHERE id = ?')
        .get(id)

      if (!order) {
        res.status(404).json({ success: false, error: '订单不存在' })
        return
      }

      if (order.buyer_id !== req.user?.id) {
        res.status(403).json({ success: false, error: '无权限操作' })
        return
      }

      if (order.status !== 'shipped') {
        res
          .status(400)
          .json({
            success: false,
            error:
              order.status === 'cancelled'
                ? '订单已取消'
                : '卖家还未发货，无法确认收货',
          })
        return
      }

      withTransaction(() => {
        db.prepare('UPDATE orders SET status = ? WHERE id = ?').run(
          'completed',
          id,
        )
        // 交换完成：两件商品同时成交
        if (order.type === 'exchange') {
          db.prepare("UPDATE products SET status = 'sold' WHERE id = ?").run(
            order.product_id,
          )
          if (order.offered_product_id) {
            db.prepare(
              "UPDATE products SET status = 'sold' WHERE id = ?",
            ).run(order.offered_product_id)
          }
        }
      })

      res.json({ success: true, message: '确认收货成功' })
    } catch (error) {
      console.error(error)
      res.status(500).json({ success: false, error: '确认收货失败' })
    }
  },
)

/**
 * 取消交换订单（买卖双方均可，完成前可取消）。
 * 取消后两件商品同时恢复在售；已失效的竞争报价不会复活。
 */
router.put(
  '/:id/cancel',
  authenticateToken,
  async (req: AuthRequest, res: Response): Promise<void> => {
    try {
      const { id } = req.params

      const order: any = db
        .prepare('SELECT * FROM orders WHERE id = ?')
        .get(id)

      if (!order) {
        res.status(404).json({ success: false, error: '订单不存在' })
        return
      }

      if (
        order.buyer_id !== req.user?.id &&
        order.seller_id !== req.user?.id
      ) {
        res.status(403).json({ success: false, error: '无权限操作' })
        return
      }

      if (order.type !== 'exchange') {
        res.status(400).json({ success: false, error: '购买订单不支持取消' })
        return
      }

      if (order.status === 'completed') {
        res.status(400).json({ success: false, error: '交易已完成，无法取消' })
        return
      }

      if (order.status === 'cancelled') {
        res.status(400).json({ success: false, error: '订单已取消' })
        return
      }

      withTransaction(() => {
        db.prepare("UPDATE orders SET status = 'cancelled' WHERE id = ?").run(
          id,
        )

        // 两件商品同时恢复在售
        db.prepare(
          "UPDATE products SET status = 'active' WHERE id IN (?, ?) AND status = 'trading'",
        ).run(order.product_id, order.offered_product_id)

        // 关联报价标记为已取消（失效报价不恢复）
        db.prepare(
          "UPDATE exchange_offers SET status = 'cancelled', updated_at = CURRENT_TIMESTAMP WHERE order_id = ? AND status = 'accepted'",
        ).run(id)
      })

      res.json({
        success: true,
        message: '交换已取消，两件商品已恢复在售',
      })
    } catch (error) {
      console.error(error)
      res.status(500).json({ success: false, error: '取消失败' })
    }
  },
)

router.get(
  '/:id',
  authenticateToken,
  async (req: AuthRequest, res: Response): Promise<void> => {
    try {
      const { id } = req.params

      const order: any = db
        .prepare(
          `
        SELECT o.*, p.name as product_name, p.description as product_description,
               p.photos, p.ip_name, p.category, p.condition,
               op.name as offered_product_name, op.photos as offered_photos,
               op.ip_name as offered_ip_name,
               buyer.username as buyer_name, buyer.avatar as buyer_avatar,
               seller.username as seller_name, seller.avatar as seller_avatar
        FROM orders o
        JOIN products p ON o.product_id = p.id
        JOIN users buyer ON o.buyer_id = buyer.id
        JOIN users seller ON o.seller_id = seller.id
        LEFT JOIN products op ON o.offered_product_id = op.id
        WHERE o.id = ?
      `,
        )
        .get(id)

      if (!order) {
        res.status(404).json({ success: false, error: '订单不存在' })
        return
      }

      if (order.buyer_id !== req.user?.id && order.seller_id !== req.user?.id) {
        res.status(403).json({ success: false, error: '无权限查看' })
        return
      }

      res.json({ success: true, data: parseOrderPhotos(order) })
    } catch (error) {
      console.error(error)
      res.status(500).json({ success: false, error: '获取订单详情失败' })
    }
  },
)

export default router
