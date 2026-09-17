import Database from 'better-sqlite3'
import path from 'path'
import { fileURLToPath } from 'url'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

const dbPath = path.join(__dirname, '../../data/anime-market.db')
const db = new Database(dbPath)

db.pragma('journal_mode = WAL')

export function initDB() {
  db.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      username TEXT UNIQUE NOT NULL,
      email TEXT UNIQUE NOT NULL,
      password TEXT NOT NULL,
      avatar TEXT,
      rating REAL DEFAULT 0,
      review_count INTEGER DEFAULT 0,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS products (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      seller_id INTEGER NOT NULL,
      name TEXT NOT NULL,
      description TEXT,
      ip_name TEXT NOT NULL,
      character_name TEXT,
      category TEXT NOT NULL,
      condition TEXT NOT NULL,
      price REAL NOT NULL,
      exchange_intent TEXT,
      photos TEXT NOT NULL,
      status TEXT DEFAULT 'active',
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (seller_id) REFERENCES users(id)
    );

    CREATE TABLE IF NOT EXISTS orders (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      product_id INTEGER NOT NULL,
      offered_product_id INTEGER,
      buyer_id INTEGER NOT NULL,
      seller_id INTEGER NOT NULL,
      price REAL NOT NULL,
      type TEXT NOT NULL,
      status TEXT DEFAULT 'pending',
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (product_id) REFERENCES products(id),
      FOREIGN KEY (offered_product_id) REFERENCES products(id),
      FOREIGN KEY (buyer_id) REFERENCES users(id),
      FOREIGN KEY (seller_id) REFERENCES users(id)
    );

    CREATE TABLE IF NOT EXISTS exchange_offers (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      target_product_id INTEGER NOT NULL,
      offered_product_id INTEGER NOT NULL,
      buyer_id INTEGER NOT NULL,
      seller_id INTEGER NOT NULL,
      status TEXT NOT NULL DEFAULT 'pending',
      order_id INTEGER,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (target_product_id) REFERENCES products(id),
      FOREIGN KEY (offered_product_id) REFERENCES products(id),
      FOREIGN KEY (buyer_id) REFERENCES users(id),
      FOREIGN KEY (seller_id) REFERENCES users(id),
      FOREIGN KEY (order_id) REFERENCES orders(id)
    );

    CREATE TABLE IF NOT EXISTS reviews (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      order_id INTEGER NOT NULL,
      reviewer_id INTEGER NOT NULL,
      reviewee_id INTEGER NOT NULL,
      rating INTEGER NOT NULL,
      comment TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (order_id) REFERENCES orders(id),
      FOREIGN KEY (reviewer_id) REFERENCES users(id),
      FOREIGN KEY (reviewee_id) REFERENCES users(id)
    );

    CREATE INDEX IF NOT EXISTS idx_products_ip ON products(ip_name);
    CREATE INDEX IF NOT EXISTS idx_products_character ON products(character_name);
    CREATE INDEX IF NOT EXISTS idx_products_category ON products(category);
    CREATE INDEX IF NOT EXISTS idx_products_status ON products(status);
    CREATE INDEX IF NOT EXISTS idx_offers_target ON exchange_offers(target_product_id);
    CREATE INDEX IF NOT EXISTS idx_offers_offered ON exchange_offers(offered_product_id);
    CREATE INDEX IF NOT EXISTS idx_offers_buyer ON exchange_offers(buyer_id);
    CREATE INDEX IF NOT EXISTS idx_offers_seller ON exchange_offers(seller_id);
  `)

  // 兼容旧库：为订单表补充交换商品列
  const orderCols = db.prepare('PRAGMA table_info(orders)').all() as Array<{
    name: string
  }>
  if (!orderCols.some((c) => c.name === 'offered_product_id')) {
    db.exec('ALTER TABLE orders ADD COLUMN offered_product_id INTEGER')
  }

  // 业务不变式：
  // 1) 同一买家对同一商品至多一笔待处理报价；
  // 2) 一笔报价至多生成一个交换订单（防重复接受）。
  // 旧库若存在历史脏数据则跳过建索引，由应用层保证。
  try {
    db.exec(`
      CREATE UNIQUE INDEX IF NOT EXISTS idx_offers_one_pending
        ON exchange_offers(target_product_id, buyer_id)
        WHERE status = 'pending';
      CREATE UNIQUE INDEX IF NOT EXISTS idx_offers_one_order
        ON exchange_offers(order_id)
        WHERE order_id IS NOT NULL;
    `)
  } catch (e) {
    console.warn('跳过交换报价唯一索引（存在历史数据冲突）:', e)
  }
}

/** 事务辅助：better-sqlite3 的 transaction 保证状态判断与写入原子执行 */
export function withTransaction<T>(fn: () => T): T {
  return db.transaction(fn)()
}

/**
 * 使所有涉及指定商品的待处理交换报价失效。
 * 商品被购买或某笔交换被接受后，其竞争报价不允许再复活。
 * 在 better-sqlite3 事务内调用即可随事务提交/回滚。
 */
export function expirePendingOffers(
  productIds: number[],
  excludeOfferId?: number,
) {
  const ids = productIds.filter(Boolean)
  if (ids.length === 0) return

  const placeholders = ids.map(() => '?').join(',')
  let sql = `
    UPDATE exchange_offers
    SET status = 'expired', updated_at = CURRENT_TIMESTAMP
    WHERE status = 'pending'
      AND (target_product_id IN (${placeholders}) OR offered_product_id IN (${placeholders}))
  `
  const params: any[] = [...ids, ...ids]
  if (excludeOfferId) {
    sql += ' AND id != ?'
    params.push(excludeOfferId)
  }
  db.prepare(sql).run(...params)
}

export default db
