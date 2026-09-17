import { Router, type Response } from 'express'
import db, {
  withTransaction,
  expirePendingOffers,
} from '../db/index.js'
import { authenticateToken, type AuthRequest } from '../middleware/auth.js'

const router = Router()

interface OfferProductInfo {
  id: number
  name: string
  photos: string
  ip_name: string
  price: number
  seller_id: number
  status: string
}

function serializeOffer(o: any) {
  return {
    ...o,
    target_photos: o.target_photos ? JSON.parse(o.target_photos) : [],
    offered_photos: o.offered_photos ? JSON.parse(o.offered_photos) : [],
  }
}

const OFFER_QUERY = `
  SELECT e.*,
         tp.name AS target_product_name, tp.photos AS target_photos,
         tp.price AS target_price, tp.ip_name AS target_ip_name,
         op.name AS offered_product_name, op.photos AS offered_photos,
         op.price AS offered_price, op.ip_name AS offered_ip_name,
         b.username AS buyer_name, b.avatar AS buyer_avatar,
         s.username AS seller_name
  FROM exchange_offers e
  JOIN products tp ON e.target_product_id = tp.id
  JOIN products op ON e.offered_product_id = op.id
  JOIN users b ON e.buyer_id = b.id
  JOIN users s ON e.seller_id = s.id
`

/** 发起交换请求：用自己的一件在售商品换卖家的商品 */
router.post(
  '/',
  authenticateToken,
  (req: AuthRequest, res: Response): void => {
    try {
      const { target_product_id, offered_product_id } = req.body || {}

      if (!target_product_id || !offered_product_id) {
        res.status(400).json({ success: false, error: '请选择一件自己的商品用于交换' })
        return
      }

      if (Number(target_product_id) === Number(offered_product_id)) {
        res.status(400).json({ success: false, error: '不能用同一件商品交换' })
        return
      }

      const target = db
        .prepare('SELECT * FROM products WHERE id = ?')
        .get(target_product_id) as OfferProductInfo | undefined

      if (!target) {
        res.status(404).json({ success: false, error: '目标商品不存在' })
        return
      }

      if (target.seller_id === req.user?.id) {
        res.status(400).json({ success: false, error: '不能用自己的商品和自己交换' })
        return
      }

      if (target.status !== 'active') {
        res.status(400).json({
          success: false,
          error:
            target.status === 'trading'
              ? '该商品正在交换交易中'
              : '该商品已售出，无法交换',
        })
        return
      }

      const offered = db
        .prepare('SELECT * FROM products WHERE id = ?')
        .get(offered_product_id) as OfferProductInfo | undefined

      if (!offered) {
        res.status(404).json({ success: false, error: '交换商品不存在' })
        return
      }

      if (offered.seller_id !== req.user?.id) {
        res.status(403).json({ success: false, error: '只能选择自己发布的商品用于交换' })
        return
      }

      if (offered.status !== 'active') {
        res.status(400).json({
          success: false,
          error:
            offered.status === 'trading'
              ? '你选择的交换商品正在交易中，请选择其他在售商品'
              : '你选择的交换商品已售出，请选择其他在售商品',
        })
        return
      }

      // 同一买家对同一商品只保留一笔有效报价：已存在待处理报价则更新
      const existing = db
        .prepare(
          `SELECT * FROM exchange_offers
           WHERE target_product_id = ? AND buyer_id = ? AND status = 'pending'`,
        )
        .get(target_product_id, req.user?.id) as
        | { id: number; offered_product_id: number }
        | undefined

      if (existing) {
        if (existing.offered_product_id === Number(offered_product_id)) {
          res.status(409).json({
            success: false,
            error: '你已对该商品发起过相同的交换请求，请等待卖家回复',
          })
          return
        }

        db.prepare(
          `UPDATE exchange_offers
           SET offered_product_id = ?, updated_at = CURRENT_TIMESTAMP
           WHERE id = ?`,
        ).run(offered_product_id, existing.id)

        const offer = db
          .prepare(`${OFFER_QUERY} WHERE e.id = ?`)
          .get(existing.id)
        res.status(200).json({
          success: true,
          data: serializeOffer(offer),
          updated: true,
          message: '交换请求已更新，请等待卖家回复',
        })
        return
      }

      const result = db
        .prepare(
          `INSERT INTO exchange_offers
             (target_product_id, offered_product_id, buyer_id, seller_id, status)
           VALUES (?, ?, ?, ?, 'pending')`,
        )
        .run(
          target_product_id,
          offered_product_id,
          req.user?.id,
          target.seller_id,
        )

      const offer = db
        .prepare(`${OFFER_QUERY} WHERE e.id = ?`)
        .get(result.lastInsertRowid)

      res.status(201).json({
        success: true,
        data: serializeOffer(offer),
        message: '交换请求已发送，请等待卖家回复',
      })
    } catch (error) {
      console.error(error)
      res.status(500).json({ success: false, error: '发起交换失败' })
    }
  },
)

/** 卖家收到的交换报价 */
router.get(
  '/received',
  authenticateToken,
  (req: AuthRequest, res: Response): void => {
    try {
      const offers = db
        .prepare(`${OFFER_QUERY} WHERE e.seller_id = ? ORDER BY e.created_at DESC`)
        .all(req.user?.id)

      res.json({ success: true, data: (offers as any[]).map(serializeOffer) })
    } catch (error) {
      console.error(error)
      res.status(500).json({ success: false, error: '获取交换请求失败' })
    }
  },
)

/** 买家发出的交换报价；可按 target_product_id 筛选当前商品的报价状态 */
router.get(
  '/mine',
  authenticateToken,
  (req: AuthRequest, res: Response): void => {
    try {
      const { target_product_id } = req.query
      let offers: any[]
      if (target_product_id) {
        offers = db
          .prepare(
            `${OFFER_QUERY} WHERE e.buyer_id = ? AND e.target_product_id = ? ORDER BY e.created_at DESC`,
          )
          .all(req.user?.id, Number(target_product_id))
      } else {
        offers = db
          .prepare(`${OFFER_QUERY} WHERE e.buyer_id = ? ORDER BY e.created_at DESC`)
          .all(req.user?.id)
      }

      res.json({ success: true, data: offers.map(serializeOffer) })
    } catch (error) {
      console.error(error)
      res.status(500).json({ success: false, error: '获取交换请求失败' })
    }
  },
)

/** 卖家接受交换：两件商品同时进入交易中，其余竞争报价自动失效 */
router.put(
  '/:id/accept',
  authenticateToken,
  (req: AuthRequest, res: Response): void => {
    try {
      const { id } = req.params
      const offer = db
        .prepare('SELECT * FROM exchange_offers WHERE id = ?')
        .get(id) as any

      if (!offer) {
        res.status(404).json({ success: false, error: '交换请求不存在' })
        return
      }

      if (offer.seller_id !== req.user?.id) {
        res.status(403).json({ success: false, error: '只有卖家可以接受交换请求' })
        return
      }

      if (offer.status !== 'pending') {
        const messages: Record<string, string> = {
          accepted: '该交换请求已接受，无需重复操作',
          rejected: '该交换请求已拒绝',
          cancelled: '买家已取消该交换请求',
          expired: '该交换请求已失效（商品已进入其他交易）',
        }
        res.status(400).json({
          success: false,
          error: messages[offer.status] || '该交换请求当前不可接受',
        })
        return
      }

      try {
        const order = withTransaction(() => {
          const target = db
            .prepare('SELECT * FROM products WHERE id = ?')
            .get(offer.target_product_id) as any
          const offered = db
            .prepare('SELECT * FROM products WHERE id = ?')
            .get(offer.offered_product_id) as any

          if (!target || !offered) {
            throw Object.assign(new Error('相关商品已不存在'), { statusCode: 400 })
          }
          if (target.status !== 'active' || offered.status !== 'active') {
            throw Object.assign(
              new Error('交换双方商品已不处于在售状态，无法接受'),
              { statusCode: 400 },
            )
          }

          const result = db
            .prepare(
              `INSERT INTO orders
                 (product_id, offered_product_id, buyer_id, seller_id, price, type, status)
               VALUES (?, ?, ?, ?, ?, 'exchange', 'pending')`,
            )
            .run(
              target.id,
              offered.id,
              offer.buyer_id,
              offer.seller_id,
              target.price,
            )

          db.prepare(
            `UPDATE exchange_offers
             SET status = 'accepted', order_id = ?, updated_at = CURRENT_TIMESTAMP
             WHERE id = ?`,
          ).run(result.lastInsertRowid, offer.id)

          // 两件商品只能同时进入交易中
          db.prepare(
            "UPDATE products SET status = 'trading' WHERE id IN (?, ?)",
          ).run(target.id, offered.id)

          // 其余竞争报价自动失效（不可复活）
          expirePendingOffers([target.id, offered.id], offer.id)

          return db.prepare('SELECT * FROM orders WHERE id = ?').get(result.lastInsertRowid)
        })

        res.status(200).json({
          success: true,
          data: order,
          message: '已接受交换，两件商品已同时进入交易中，请尽快发货',
        })
      } catch (e: any) {
        if (e.statusCode) {
          res.status(e.statusCode).json({ success: false, error: e.message })
          return
        }
        throw e
      }
    } catch (error) {
      console.error(error)
      res.status(500).json({ success: false, error: '接受交换失败' })
    }
  },
)

/** 卖家拒绝交换 */
router.put(
  '/:id/reject',
  authenticateToken,
  (req: AuthRequest, res: Response): void => {
    try {
      const { id } = req.params
      const offer = db
        .prepare('SELECT * FROM exchange_offers WHERE id = ?')
        .get(id) as any

      if (!offer) {
        res.status(404).json({ success: false, error: '交换请求不存在' })
        return
      }

      if (offer.seller_id !== req.user?.id) {
        res.status(403).json({ success: false, error: '只有卖家可以拒绝交换请求' })
        return
      }

      if (offer.status !== 'pending') {
        res.status(400).json({
          success: false,
          error:
            offer.status === 'accepted'
              ? '该交换已接受，如需终止请在订单中取消'
              : '该交换请求已处理，无法拒绝',
        })
        return
      }

      db.prepare(
        "UPDATE exchange_offers SET status = 'rejected', updated_at = CURRENT_TIMESTAMP WHERE id = ?",
      ).run(id)

      res.json({ success: true, message: '已拒绝该交换请求' })
    } catch (error) {
      console.error(error)
      res.status(500).json({ success: false, error: '拒绝交换失败' })
    }
  },
)

/** 买家撤销尚未被接受的交换请求 */
router.put(
  '/:id/cancel',
  authenticateToken,
  (req: AuthRequest, res: Response): void => {
    try {
      const { id } = req.params
      const offer = db
        .prepare('SELECT * FROM exchange_offers WHERE id = ?')
        .get(id) as any

      if (!offer) {
        res.status(404).json({ success: false, error: '交换请求不存在' })
        return
      }

      if (offer.buyer_id !== req.user?.id) {
        res.status(403).json({ success: false, error: '只有发起者可以撤销交换请求' })
        return
      }

      if (offer.status !== 'pending') {
        res.status(400).json({
          success: false,
          error:
            offer.status === 'accepted'
              ? '交换已被接受，如需终止请在订单中取消'
              : '该交换请求已结束，无法撤销',
        })
        return
      }

      db.prepare(
        "UPDATE exchange_offers SET status = 'cancelled', updated_at = CURRENT_TIMESTAMP WHERE id = ?",
      ).run(id)

      res.json({ success: true, message: '已撤销交换请求' })
    } catch (error) {
      console.error(error)
      res.status(500).json({ success: false, error: '撤销交换失败' })
    }
  },
)

export default router
