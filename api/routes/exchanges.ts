import { Router, type Response } from 'express'
import db from '../db/index.js'
import { authenticateToken, type AuthRequest } from '../middleware/auth.js'

const router = Router()

const OFFER_DETAIL_QUERY = `
  SELECT e.*,
    tp.name as target_name, tp.photos as target_photos, tp.price as target_price, tp.status as target_status,
    op.name as offered_name, op.photos as offered_photos, op.price as offered_price, op.status as offered_status,
    ru.username as requester_name,
    su.username as seller_name
  FROM exchange_offers e
  JOIN products tp ON e.target_product_id = tp.id
  JOIN products op ON e.offered_product_id = op.id
  JOIN users ru ON e.requester_id = ru.id
  JOIN users su ON e.seller_id = su.id
`

function parseOffer(o: any) {
  return {
    ...o,
    target_photos: JSON.parse(o.target_photos),
    offered_photos: JSON.parse(o.offered_photos),
  }
}

function getProduct(id: number): any {
  return db.prepare('SELECT * FROM products WHERE id = ?').get(id)
}

function getOffer(id: number | string): any {
  return db.prepare('SELECT * FROM exchange_offers WHERE id = ?').get(id)
}

// 发起交换报价：选自己的一件在售商品换对方商品
router.post(
  '/',
  authenticateToken,
  async (req: AuthRequest, res: Response): Promise<void> => {
    try {
      const { target_product_id, offered_product_id } = req.body
      const userId = req.user!.id

      if (!target_product_id || !offered_product_id) {
        res.status(400).json({ success: false, error: '请选择用于交换的商品' })
        return
      }

      if (Number(target_product_id) === Number(offered_product_id)) {
        res.status(400).json({ success: false, error: '不能选择同一件商品' })
        return
      }

      const target = getProduct(target_product_id)
      if (!target) {
        res.status(404).json({ success: false, error: '目标商品不存在' })
        return
      }
      if (target.status !== 'active') {
        res.status(400).json({ success: false, error: '目标商品当前不在售，无法交换' })
        return
      }
      if (target.seller_id === userId) {
        res.status(400).json({ success: false, error: '不能与自己发布的商品交换' })
        return
      }

      const offered = getProduct(offered_product_id)
      if (!offered) {
        res.status(404).json({ success: false, error: '用于交换的商品不存在' })
        return
      }
      if (offered.seller_id !== userId) {
        res.status(403).json({ success: false, error: '只能使用自己发布的商品交换' })
        return
      }
      if (offered.status !== 'active') {
        res.status(400).json({ success: false, error: '你的商品当前不在售，无法用于交换' })
        return
      }

      const createOffer = db.transaction(() => {
        // 同一买家对同一目标商品只保留一笔有效报价，旧报价自动失效且不可复活
        db.prepare(
          `UPDATE exchange_offers SET status = 'invalid', updated_at = CURRENT_TIMESTAMP
           WHERE requester_id = ? AND target_product_id = ? AND status = 'pending'`,
        ).run(userId, target_product_id)

        const result = db
          .prepare(
            `INSERT INTO exchange_offers (target_product_id, offered_product_id, requester_id, seller_id, status)
             VALUES (?, ?, ?, ?, 'pending')`,
          )
          .run(target_product_id, offered_product_id, userId, target.seller_id)

        return result.lastInsertRowid
      })

      const offerId = createOffer()
      const offer = db
        .prepare(`${OFFER_DETAIL_QUERY} WHERE e.id = ?`)
        .get(offerId)

      res.status(201).json({
        success: true,
        data: parseOffer(offer),
        message: '交换报价已发送，等待卖家处理',
      })
    } catch (error) {
      console.error(error)
      res.status(500).json({ success: false, error: '发起交换失败，请稍后重试' })
    }
  },
)

// 卖家：收到的报价
router.get(
  '/received',
  authenticateToken,
  async (req: AuthRequest, res: Response): Promise<void> => {
    try {
      const offers = db
        .prepare(`${OFFER_DETAIL_QUERY} WHERE e.seller_id = ? ORDER BY e.created_at DESC`)
        .all(req.user!.id)

      res.json({ success: true, data: offers.map(parseOffer) })
    } catch (error) {
      console.error(error)
      res.status(500).json({ success: false, error: '获取收到的报价失败' })
    }
  },
)

// 买家：我发起的报价
router.get(
  '/sent',
  authenticateToken,
  async (req: AuthRequest, res: Response): Promise<void> => {
    try {
      const offers = db
        .prepare(`${OFFER_DETAIL_QUERY} WHERE e.requester_id = ? ORDER BY e.created_at DESC`)
        .all(req.user!.id)

      res.json({ success: true, data: offers.map(parseOffer) })
    } catch (error) {
      console.error(error)
      res.status(500).json({ success: false, error: '获取我发起的报价失败' })
    }
  },
)

// 卖家接受报价：两件商品同时进入交易中，其余竞争报价自动失效
router.put(
  '/:id/accept',
  authenticateToken,
  async (req: AuthRequest, res: Response): Promise<void> => {
    try {
      const { id } = req.params
      const offer = getOffer(id)

      if (!offer) {
        res.status(404).json({ success: false, error: '报价不存在' })
        return
      }
      if (offer.seller_id !== req.user!.id) {
        res.status(403).json({ success: false, error: '只有卖家可以接受报价' })
        return
      }
      if (offer.status !== 'pending') {
        res.status(400).json({ success: false, error: '该报价已处理，无法重复操作' })
        return
      }

      const target = getProduct(offer.target_product_id)
      const offered = getProduct(offer.offered_product_id)

      if (!target || target.status !== 'active') {
        db.prepare(
          `UPDATE exchange_offers SET status = 'invalid', updated_at = CURRENT_TIMESTAMP WHERE id = ?`,
        ).run(id)
        res.status(400).json({ success: false, error: '你的商品已不在售，该报价已失效' })
        return
      }
      if (!offered || offered.status !== 'active') {
        db.prepare(
          `UPDATE exchange_offers SET status = 'invalid', updated_at = CURRENT_TIMESTAMP WHERE id = ?`,
        ).run(id)
        res.status(400).json({ success: false, error: '对方用于交换的商品已不在售，该报价已失效' })
        return
      }

      db.transaction(() => {
        // 两件商品只能同时进入交易中
        const lockTarget = db
          .prepare(`UPDATE products SET status = 'trading' WHERE id = ? AND status = 'active'`)
          .run(offer.target_product_id)
        const lockOffered = db
          .prepare(`UPDATE products SET status = 'trading' WHERE id = ? AND status = 'active'`)
          .run(offer.offered_product_id)

        if (lockTarget.changes !== 1 || lockOffered.changes !== 1) {
          throw new Error('PRODUCT_STATE_CHANGED')
        }

        db.prepare(
          `UPDATE exchange_offers SET status = 'accepted', updated_at = CURRENT_TIMESTAMP WHERE id = ?`,
        ).run(id)

        // 涉及这两件商品的其余竞争报价自动失效
        db.prepare(
          `UPDATE exchange_offers SET status = 'invalid', updated_at = CURRENT_TIMESTAMP
           WHERE status = 'pending' AND id != ?
             AND (target_product_id IN (?, ?) OR offered_product_id IN (?, ?))`,
        ).run(id, offer.target_product_id, offer.offered_product_id, offer.target_product_id, offer.offered_product_id)
      })()

      res.json({ success: true, message: '已接受报价，两件商品进入交易中' })
    } catch (error: any) {
      if (error?.message === 'PRODUCT_STATE_CHANGED') {
        res.status(409).json({ success: false, error: '商品状态已变化，请刷新后重试' })
        return
      }
      console.error(error)
      res.status(500).json({ success: false, error: '接受报价失败，请稍后重试' })
    }
  },
)

// 卖家拒绝报价
router.put(
  '/:id/reject',
  authenticateToken,
  async (req: AuthRequest, res: Response): Promise<void> => {
    try {
      const { id } = req.params
      const offer = getOffer(id)

      if (!offer) {
        res.status(404).json({ success: false, error: '报价不存在' })
        return
      }
      if (offer.seller_id !== req.user!.id) {
        res.status(403).json({ success: false, error: '只有卖家可以拒绝报价' })
        return
      }
      if (offer.status !== 'pending') {
        res.status(400).json({ success: false, error: '该报价已处理，无法重复操作' })
        return
      }

      db.prepare(
        `UPDATE exchange_offers SET status = 'rejected', updated_at = CURRENT_TIMESTAMP WHERE id = ?`,
      ).run(id)

      res.json({ success: true, message: '已拒绝该报价' })
    } catch (error) {
      console.error(error)
      res.status(500).json({ success: false, error: '拒绝报价失败，请稍后重试' })
    }
  },
)

// 取消：待处理时发起方可取消；交易中时任一方可取消，两件商品恢复在售
router.put(
  '/:id/cancel',
  authenticateToken,
  async (req: AuthRequest, res: Response): Promise<void> => {
    try {
      const { id } = req.params
      const offer = getOffer(id)

      if (!offer) {
        res.status(404).json({ success: false, error: '报价不存在' })
        return
      }

      const userId = req.user!.id
      const isParty = offer.requester_id === userId || offer.seller_id === userId

      if (offer.status === 'pending') {
        if (offer.requester_id !== userId) {
          res.status(403).json({ success: false, error: '只有发起方可以取消待处理的报价' })
          return
        }
        db.prepare(
          `UPDATE exchange_offers SET status = 'cancelled', updated_at = CURRENT_TIMESTAMP WHERE id = ?`,
        ).run(id)
        res.json({ success: true, message: '报价已取消' })
        return
      }

      if (offer.status === 'accepted') {
        if (!isParty) {
          res.status(403).json({ success: false, error: '无权限操作' })
          return
        }
        db.transaction(() => {
          db.prepare(
            `UPDATE exchange_offers SET status = 'cancelled', updated_at = CURRENT_TIMESTAMP WHERE id = ?`,
          ).run(id)
          // 两件商品恢复在售；已失效的竞争报价保持失效，不能复活
          db.prepare(
            `UPDATE products SET status = 'active' WHERE id IN (?, ?) AND status = 'trading'`,
          ).run(offer.target_product_id, offer.offered_product_id)
        })()
        res.json({ success: true, message: '交换已取消，两件商品已恢复在售' })
        return
      }

      res.status(400).json({ success: false, error: '当前状态不可取消' })
    } catch (error) {
      console.error(error)
      res.status(500).json({ success: false, error: '取消失败，请稍后重试' })
    }
  },
)

// 交易中双方确认完成：双方都确认后交换完成，两件商品标记为已交换
router.put(
  '/:id/confirm',
  authenticateToken,
  async (req: AuthRequest, res: Response): Promise<void> => {
    try {
      const { id } = req.params
      const offer = getOffer(id)

      if (!offer) {
        res.status(404).json({ success: false, error: '报价不存在' })
        return
      }

      const userId = req.user!.id
      const isRequester = offer.requester_id === userId
      const isSeller = offer.seller_id === userId

      if (!isRequester && !isSeller) {
        res.status(403).json({ success: false, error: '无权限操作' })
        return
      }
      if (offer.status !== 'accepted') {
        res.status(400).json({ success: false, error: '报价不在交易中，无法确认完成' })
        return
      }

      const alreadyConfirmed = isRequester
        ? offer.requester_confirmed
        : offer.seller_confirmed
      if (alreadyConfirmed) {
        res.status(400).json({ success: false, error: '你已确认过，请等待对方确认' })
        return
      }

      const result = db.transaction(() => {
        db.prepare(
          `UPDATE exchange_offers SET ${isRequester ? 'requester_confirmed' : 'seller_confirmed'} = 1,
             updated_at = CURRENT_TIMESTAMP
           WHERE id = ?`,
        ).run(id)

        const fresh = getOffer(id)
        if (fresh.requester_confirmed && fresh.seller_confirmed) {
          db.prepare(
            `UPDATE exchange_offers SET status = 'completed', updated_at = CURRENT_TIMESTAMP WHERE id = ?`,
          ).run(id)
          db.prepare(
            `UPDATE products SET status = 'sold' WHERE id IN (?, ?)`,
          ).run(offer.target_product_id, offer.offered_product_id)
          return true
        }
        return false
      })()

      res.json({
        success: true,
        message: result ? '双方已确认，交换完成' : '已确认，等待对方确认',
      })
    } catch (error) {
      console.error(error)
      res.status(500).json({ success: false, error: '确认失败，请稍后重试' })
    }
  },
)

export default router
