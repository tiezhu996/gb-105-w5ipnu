import { useState, useEffect } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useAuthStore } from '../store/auth'
import { productAPI, orderAPI, reviewAPI, exchangeAPI } from '../lib/api'
import {
  ArrowLeft,
  User,
  Star,
  ShoppingCart,
  Package,
  Tag,
  LogOut,
  ChevronRight,
  Send,
  CheckCircle,
  MessageSquare,
  RefreshCw,
  XCircle,
  Clock,
  Ban,
  AlertCircle,
} from 'lucide-react'

const statusMap: Record<string, { label: string; color: string }> = {
  pending: { label: '待发货', color: 'text-orange-500 bg-orange-50' },
  shipped: { label: '待收货', color: 'text-blue-500 bg-blue-50' },
  completed: { label: '已完成', color: 'text-green-500 bg-green-50' },
  cancelled: { label: '已取消', color: 'text-gray-500 bg-gray-100' },
}

const typeMap: Record<string, string> = {
  buy: '购买',
  exchange: '以物换物',
}

const productStatusMap: Record<string, { label: string; cls: string }> = {
  active: { label: '在售', cls: 'text-green-600 bg-green-50' },
  trading: { label: '交易中', cls: 'text-orange-600 bg-orange-50' },
  sold: { label: '已售出', cls: 'text-gray-500 bg-gray-100' },
}

const offerStatusMap: Record<
  string,
  { label: string; cls: string; icon: typeof Clock }
> = {
  pending: { label: '待回复', cls: 'text-orange-500 bg-orange-50', icon: Clock },
  accepted: { label: '已接受 · 交易中', cls: 'text-green-600 bg-green-50', icon: CheckCircle },
  rejected: { label: '已拒绝', cls: 'text-gray-500 bg-gray-100', icon: Ban },
  cancelled: { label: '已撤销', cls: 'text-gray-500 bg-gray-100', icon: XCircle },
  expired: {
    label: '已失效（商品进入其他交易）',
    cls: 'text-red-500 bg-red-50',
    icon: AlertCircle,
  },
}

export default function Profile() {
  const [activeTab, setActiveTab] = useState<'bought' | 'sold' | 'published'>('bought')
  const [boughtOrders, setBoughtOrders] = useState<any[]>([])
  const [soldOrders, setSoldOrders] = useState<any[]>([])
  const [products, setProducts] = useState<any[]>([])
  const [myOffers, setMyOffers] = useState<any[]>([])
  const [receivedOffers, setReceivedOffers] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const { user, logout, isAuthenticated } = useAuthStore()
  const navigate = useNavigate()

  useEffect(() => {
    if (isAuthenticated) loadData()
  }, [activeTab, isAuthenticated])

  if (!isAuthenticated) {
    navigate('/login')
    return null
  }

  const loadData = async () => {
    setLoading(true)
    try {
      if (activeTab === 'bought') {
        const [ordersRes, offersRes] = await Promise.all([
          orderAPI.getBuyerOrders(),
          exchangeAPI.getMyOffers(),
        ])
        setBoughtOrders(ordersRes.data.data)
        setMyOffers(offersRes.data.data || [])
      } else if (activeTab === 'sold') {
        const [ordersRes, offersRes] = await Promise.all([
          orderAPI.getSellerOrders(),
          exchangeAPI.getReceivedOffers(),
        ])
        setSoldOrders(ordersRes.data.data)
        setReceivedOffers(offersRes.data.data || [])
      } else {
        const res = await productAPI.getMyProducts()
        setProducts(res.data.data)
      }
    } catch (error) {
      console.error('Failed to load data:', error)
    } finally {
      setLoading(false)
    }
  }

  const handleShip = async (orderId: number) => {
    try {
      const res = await orderAPI.shipOrder(orderId)
      alert(res.data?.message || '发货成功')
      loadData()
    } catch (error: any) {
      alert(error.response?.data?.error || '操作失败')
    }
  }

  const handleReceive = async (orderId: number) => {
    try {
      const res = await orderAPI.receiveOrder(orderId)
      alert(res.data?.message || '确认收货成功')
      loadData()
    } catch (error: any) {
      alert(error.response?.data?.error || '操作失败')
    }
  }

  const handleCancelOrder = async (orderId: number) => {
    if (!confirm('确定取消这笔交换交易吗？取消后两件商品将同时恢复在售。')) return
    try {
      const res = await orderAPI.cancelOrder(orderId)
      alert(res.data?.message || '已取消')
      loadData()
    } catch (error: any) {
      alert(error.response?.data?.error || '取消失败')
    }
  }

  const handleAcceptOffer = async (offerId: number) => {
    if (
      !confirm(
        '接受后两件商品将同时进入交易中，其他交换请求会自动失效。确定接受吗？',
      )
    )
      return
    try {
      const res = await exchangeAPI.acceptOffer(offerId)
      alert(res.data?.message || '已接受交换')
      loadData()
    } catch (error: any) {
      alert(error.response?.data?.error || '操作失败')
    }
  }

  const handleRejectOffer = async (offerId: number) => {
    if (!confirm('确定拒绝这笔交换请求吗？')) return
    try {
      const res = await exchangeAPI.rejectOffer(offerId)
      alert(res.data?.message || '已拒绝')
      loadData()
    } catch (error: any) {
      alert(error.response?.data?.error || '操作失败')
    }
  }

  const handleCancelOffer = async (offerId: number) => {
    if (!confirm('确定撤销这笔交换请求吗？')) return
    try {
      const res = await exchangeAPI.cancelOffer(offerId)
      alert(res.data?.message || '已撤销')
      loadData()
    } catch (error: any) {
      alert(error.response?.data?.error || '撤销失败')
    }
  }

  const handleReview = async (order: any) => {
    const rating = prompt('请给对方评分（1-5星）：', '5')
    if (!rating) return

    const ratingNum = parseInt(rating)
    if (ratingNum < 1 || ratingNum > 5) {
      alert('评分必须在1-5之间')
      return
    }

    const comment = prompt('请输入评价内容（可选）：', '')

    try {
      await reviewAPI.createReview({
        order_id: order.id,
        // 买家评价卖家，卖家评价买家
        reviewee_id: order.seller_id === user?.id ? order.buyer_id : order.seller_id,
        rating: ratingNum,
        comment: comment || '',
      })
      alert('评价成功')
      loadData()
    } catch (error: any) {
      alert(error.response?.data?.error || '评价失败')
    }
  }

  /** 交换报价卡片 */
  const renderOfferCard = (offer: any, isSeller: boolean) => {
    const st = offerStatusMap[offer.status] || offerStatusMap.pending
    const StatusIcon = st.icon
    return (
      <div
        key={`offer-${offer.id}`}
        className="bg-white rounded-2xl p-4 mb-3 border-2 border-pink-100"
      >
        <div className="flex items-center justify-between mb-3">
          <span className="text-xs font-medium text-pink-500 bg-pink-50 px-2 py-1 rounded-full flex items-center gap-1">
            <RefreshCw className="w-3 h-3" />
            交换请求
          </span>
          <span className={`px-2 py-1 rounded-full text-xs font-medium flex items-center gap-1 ${st.cls}`}>
            <StatusIcon className="w-3 h-3" />
            {st.label}
          </span>
        </div>

        <div className="flex items-center gap-2">
          <div className="flex-1 min-w-0 text-center">
            <img
              src={offer.offered_photos?.[0] || 'https://picsum.photos/200/200'}
              alt={offer.offered_product_name}
              className="w-full h-20 rounded-xl object-cover"
            />
            <p className="text-xs text-gray-500 mt-1 truncate">
              {isSeller ? `${offer.buyer_name} 的商品` : '我的商品'}
            </p>
            <p className="text-sm font-medium text-gray-900 truncate">
              {offer.offered_product_name}
            </p>
          </div>
          <RefreshCw className="w-5 h-5 text-pink-400 shrink-0" />
          <div className="flex-1 min-w-0 text-center">
            <img
              src={offer.target_photos?.[0] || 'https://picsum.photos/200/200'}
              alt={offer.target_product_name}
              className="w-full h-20 rounded-xl object-cover"
            />
            <p className="text-xs text-gray-500 mt-1 truncate">
              {isSeller ? '我的商品' : `${offer.seller_name} 的商品`}
            </p>
            <p className="text-sm font-medium text-gray-900 truncate">
              {offer.target_product_name}
            </p>
          </div>
        </div>

        {offer.status === 'pending' && (
          <div className="flex gap-2 mt-3 pt-3 border-t border-gray-100">
            {isSeller ? (
              <>
                <button
                  onClick={() => handleRejectOffer(offer.id)}
                  className="flex-1 py-2 bg-gray-100 text-gray-600 rounded-xl font-medium hover:bg-gray-200 transition-all flex items-center justify-center gap-1"
                >
                  <Ban className="w-4 h-4" />
                  拒绝
                </button>
                <button
                  onClick={() => handleAcceptOffer(offer.id)}
                  className="flex-1 py-2 bg-gradient-to-r from-pink-500 to-purple-500 text-white rounded-xl font-medium hover:opacity-90 transition-all flex items-center justify-center gap-1"
                >
                  <CheckCircle className="w-4 h-4" />
                  接受交换
                </button>
              </>
            ) : (
              <button
                onClick={() => handleCancelOffer(offer.id)}
                className="flex-1 py-2 bg-gray-100 text-gray-600 rounded-xl font-medium hover:bg-gray-200 transition-all flex items-center justify-center gap-1"
              >
                <XCircle className="w-4 h-4" />
                撤销请求
              </button>
            )}
          </div>
        )}
      </div>
    )
  }

  /** 订单卡片 */
  const renderOrderCard = (order: any, isSeller: boolean) => {
    const status = statusMap[order.status] || statusMap.pending
    const isExchange = order.type === 'exchange'
    const canCancel = isExchange && ['pending', 'shipped'].includes(order.status)
    return (
      <div key={`order-${order.id}`} className="bg-white rounded-2xl p-4 mb-4">
        <div className="flex items-start gap-4">
          <img
            src={order.photos?.[0] || 'https://picsum.photos/200/200'}
            alt={order.product_name}
            className="w-20 h-20 rounded-xl object-cover"
          />
          <div className="flex-1 min-w-0">
            <div className="flex items-start justify-between gap-2">
              <h3 className="font-medium text-gray-900 truncate">
                {order.product_name}
              </h3>
              <span className={`px-2 py-1 rounded-full text-xs font-medium shrink-0 ${status.color}`}>
                {status.label}
              </span>
            </div>
            <p className="text-purple-600 font-semibold mt-1">¥{order.price}</p>
            <p className="text-sm text-gray-500 mt-1">
              {typeMap[order.type] || order.type} · {isSeller ? `买家: ${order.buyer_name}` : `卖家: ${order.seller_name}`}
            </p>

            {isExchange && order.offered_product_name && (
              <div className="mt-2 flex items-center gap-2 text-xs text-pink-600 bg-pink-50 rounded-lg px-2 py-1.5">
                <RefreshCw className="w-3.5 h-3.5 shrink-0" />
                <span className="truncate">
                  用于交换：{order.offered_product_name}
                </span>
              </div>
            )}
          </div>
        </div>

        <div className="flex gap-2 mt-4 pt-4 border-t border-gray-100">
          {isSeller && order.status === 'pending' && (
            <button
              onClick={() => handleShip(order.id)}
              className="flex-1 py-2 bg-purple-500 text-white rounded-xl font-medium hover:bg-purple-600 transition-all flex items-center justify-center gap-1"
            >
              <Send className="w-4 h-4" />
              发货
            </button>
          )}
          {!isSeller && order.status === 'shipped' && (
            <button
              onClick={() => handleReceive(order.id)}
              className="flex-1 py-2 bg-purple-500 text-white rounded-xl font-medium hover:bg-purple-600 transition-all flex items-center justify-center gap-1"
            >
              <CheckCircle className="w-4 h-4" />
              确认收货
            </button>
          )}
          {order.status === 'completed' && (
            <button
              onClick={() => handleReview(order)}
              className="flex-1 py-2 bg-pink-50 text-pink-600 rounded-xl font-medium hover:bg-pink-100 transition-all flex items-center justify-center gap-1"
            >
              <MessageSquare className="w-4 h-4" />
              评价
            </button>
          )}
          {canCancel && (
            <button
              onClick={() => handleCancelOrder(order.id)}
              className="flex-1 py-2 bg-gray-100 text-gray-600 rounded-xl font-medium hover:bg-gray-200 transition-all flex items-center justify-center gap-1"
            >
              <XCircle className="w-4 h-4" />
              取消交换
            </button>
          )}
        </div>
      </div>
    )
  }

  /** 我买到的：发出的交换请求 + 订单 */
  const boughtOffers = myOffers.filter((o) => o.status !== 'accepted')
  /** 我卖出的：待处理的交换请求置顶，其他状态的也可查看 */
  const pendingReceived = receivedOffers.filter((o) => o.status === 'pending')
  const historyReceived = receivedOffers.filter((o) => o.status !== 'pending')

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="bg-white shadow-sm sticky top-0 z-40">
        <div className="max-w-2xl mx-auto px-4 py-4">
          <div className="flex items-center gap-4">
            <Link
              to="/"
              className="w-10 h-10 flex items-center justify-center rounded-xl hover:bg-gray-100 transition-all"
            >
              <ArrowLeft className="w-5 h-5 text-gray-600" />
            </Link>
            <h1 className="text-xl font-bold text-gray-900">个人中心</h1>
          </div>
        </div>
      </header>

      <main className="max-w-2xl mx-auto px-4 py-6">
        <div className="bg-white rounded-2xl p-6 mb-6">
          <div className="flex items-center gap-4">
            <div className="w-16 h-16 bg-gradient-to-r from-purple-400 to-pink-400 rounded-2xl flex items-center justify-center">
              <User className="w-8 h-8 text-white" />
            </div>
            <div className="flex-1">
              <h2 className="text-xl font-bold text-gray-900">{user?.username}</h2>
              <div className="flex items-center gap-2 mt-1 text-sm text-gray-500">
                <Star className="w-4 h-4 text-yellow-400 fill-yellow-400" />
                <span>{user?.rating || 0}</span>
                <span className="text-gray-300">·</span>
                <span>{user?.review_count || 0}条评价</span>
              </div>
            </div>
            <button
              onClick={() => {
                logout()
                navigate('/')
              }}
              className="p-2 text-gray-500 hover:text-red-500 hover:bg-red-50 rounded-xl transition-all"
            >
              <LogOut className="w-5 h-5" />
            </button>
          </div>
        </div>

        <div className="flex gap-2 mb-6 bg-white p-1 rounded-xl">
          {[
            { id: 'bought', label: '我买到的', icon: ShoppingCart },
            { id: 'sold', label: '我卖出的', icon: Package },
            { id: 'published', label: '我的发布', icon: Tag },
          ].map((tab) => {
            const Icon = tab.icon
            return (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id as any)}
                className={`flex-1 py-2.5 rounded-lg font-medium transition-all flex items-center justify-center gap-1.5 ${
                  activeTab === tab.id
                    ? 'bg-gradient-to-r from-purple-500 to-pink-500 text-white shadow-lg shadow-purple-500/20'
                    : 'text-gray-600 hover:bg-gray-50'
                }`}
              >
                <Icon className="w-4 h-4" />
                {tab.label}
              </button>
            )
          })}
        </div>

        {loading ? (
          <div className="space-y-4">
            {[...Array(3)].map((_, i) => (
              <div key={i} className="bg-white rounded-2xl p-4 animate-pulse">
                <div className="flex items-start gap-4">
                  <div className="w-20 h-20 bg-gray-200 rounded-xl" />
                  <div className="flex-1 space-y-3">
                    <div className="h-5 bg-gray-200 rounded w-3/4" />
                    <div className="h-4 bg-gray-200 rounded w-1/2" />
                    <div className="h-4 bg-gray-200 rounded w-2/3" />
                  </div>
                </div>
              </div>
            ))}
          </div>
        ) : activeTab === 'bought' ? (
          boughtOrders.length === 0 && boughtOffers.length === 0 ? (
            <div className="text-center py-16">
              <ShoppingCart className="w-16 h-16 text-gray-300 mx-auto mb-4" />
              <p className="text-gray-500">还没有买到任何商品</p>
              <Link to="/" className="text-purple-500 hover:underline mt-2 inline-block">
                去逛逛
              </Link>
            </div>
          ) : (
            <>
              {boughtOffers.map((offer) => renderOfferCard(offer, false))}
              {boughtOrders.map((order) => renderOrderCard(order, false))}
            </>
          )
        ) : activeTab === 'sold' ? (
          soldOrders.length === 0 && receivedOffers.length === 0 ? (
            <div className="text-center py-16">
              <Package className="w-16 h-16 text-gray-300 mx-auto mb-4" />
              <p className="text-gray-500">还没有卖出任何商品</p>
            </div>
          ) : (
            <>
              {pendingReceived.length > 0 && (
                <div className="mb-2 px-1 text-sm font-medium text-gray-500">
                  收到的交换请求（{pendingReceived.length}）
                </div>
              )}
              {pendingReceived.map((offer) => renderOfferCard(offer, true))}
              {soldOrders.map((order) => renderOrderCard(order, true))}
              {historyReceived.length > 0 && (
                <details className="mt-4">
                  <summary className="px-1 text-sm text-gray-400 cursor-pointer hover:text-gray-600">
                    已处理的交换请求（{historyReceived.length}）
                  </summary>
                  <div className="mt-2">
                    {historyReceived.map((offer) => renderOfferCard(offer, true))}
                  </div>
                </details>
              )}
            </>
          )
        ) : products.length === 0 ? (
          <div className="text-center py-16">
            <Tag className="w-16 h-16 text-gray-300 mx-auto mb-4" />
            <p className="text-gray-500">还没有发布任何商品</p>
            <Link to="/publish" className="text-purple-500 hover:underline mt-2 inline-block">
              去发布
            </Link>
          </div>
        ) : (
          <div className="space-y-4">
            {products.map((product) => {
              const pStatus =
                productStatusMap[product.status] || productStatusMap.active
              return (
                <Link
                  key={product.id}
                  to={`/product/${product.id}`}
                  className="bg-white rounded-2xl p-4 flex items-center gap-4 block"
                >
                  <img
                    src={product.photos?.[0] || 'https://picsum.photos/200/200'}
                    alt={product.name}
                    className="w-20 h-20 rounded-xl object-cover"
                  />
                  <div className="flex-1 min-w-0">
                    <h3 className="font-medium text-gray-900 truncate">
                      {product.name}
                    </h3>
                    <p className="text-purple-600 font-semibold mt-1">
                      ¥{product.price}
                    </p>
                    <span className={`inline-block mt-1 px-2 py-0.5 rounded-full text-xs font-medium ${pStatus.cls}`}>
                      {pStatus.label}
                    </span>
                  </div>
                  <ChevronRight className="w-5 h-5 text-gray-400" />
                </Link>
              )
            })}
          </div>
        )}
      </main>
    </div>
  )
}
