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
  Check,
  X,
  ArrowLeftRight,
} from 'lucide-react'

const statusMap: Record<string, { label: string; color: string }> = {
  pending: { label: '待发货', color: 'text-orange-500 bg-orange-50' },
  shipped: { label: '待收货', color: 'text-blue-500 bg-blue-50' },
  completed: { label: '已完成', color: 'text-green-500 bg-green-50' },
}

const typeMap: Record<string, string> = {
  buy: '购买',
  exchange: '交换',
}

const offerStatusMap: Record<string, { label: string; color: string }> = {
  pending: { label: '待处理', color: 'text-orange-500 bg-orange-50' },
  accepted: { label: '交易中', color: 'text-blue-500 bg-blue-50' },
  rejected: { label: '已拒绝', color: 'text-red-500 bg-red-50' },
  cancelled: { label: '已取消', color: 'text-gray-500 bg-gray-100' },
  invalid: { label: '已失效', color: 'text-gray-400 bg-gray-100' },
  completed: { label: '已完成', color: 'text-green-500 bg-green-50' },
}

const productStatusMap: Record<string, { label: string; color: string }> = {
  active: { label: '在售', color: 'text-green-500 bg-green-50' },
  trading: { label: '交易中', color: 'text-blue-500 bg-blue-50' },
  sold: { label: '已售出', color: 'text-gray-500 bg-gray-100' },
}

export default function Profile() {
  const [activeTab, setActiveTab] = useState<'bought' | 'sold' | 'published' | 'exchange'>('bought')
  const [boughtOrders, setBoughtOrders] = useState<any[]>([])
  const [soldOrders, setSoldOrders] = useState<any[]>([])
  const [products, setProducts] = useState<any[]>([])
  const [exchangeSubTab, setExchangeSubTab] = useState<'received' | 'sent'>('received')
  const [receivedOffers, setReceivedOffers] = useState<any[]>([])
  const [sentOffers, setSentOffers] = useState<any[]>([])
  const [offerActionId, setOfferActionId] = useState<number | null>(null)
  const [loading, setLoading] = useState(true)
  const { user, logout, isAuthenticated } = useAuthStore()
  const navigate = useNavigate()

  if (!isAuthenticated) {
    navigate('/login')
    return null
  }

  useEffect(() => {
    loadData()
  }, [activeTab])

  const loadData = async () => {
    setLoading(true)
    try {
      if (activeTab === 'bought') {
        const res = await orderAPI.getBuyerOrders()
        setBoughtOrders(res.data.data)
      } else if (activeTab === 'sold') {
        const res = await orderAPI.getSellerOrders()
        setSoldOrders(res.data.data)
      } else if (activeTab === 'exchange') {
        const [received, sent] = await Promise.all([
          exchangeAPI.getReceived(),
          exchangeAPI.getSent(),
        ])
        setReceivedOffers(received.data.data)
        setSentOffers(sent.data.data)
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
      await orderAPI.shipOrder(orderId)
      loadData()
      alert('发货成功')
    } catch (error: any) {
      alert(error.response?.data?.error || '操作失败')
    }
  }

  const handleReceive = async (orderId: number) => {
    try {
      await orderAPI.receiveOrder(orderId)
      loadData()
      alert('确认收货成功')
    } catch (error: any) {
      alert(error.response?.data?.error || '操作失败')
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
        reviewee_id: order.seller_id || order.buyer_id,
        rating: ratingNum,
        comment: comment || '',
      })
      alert('评价成功')
      loadData()
    } catch (error: any) {
      alert(error.response?.data?.error || '评价失败')
    }
  }

  const handleOfferAction = async (
    offerId: number,
    action: 'accept' | 'reject' | 'cancel' | 'confirm',
    confirmText: string,
  ) => {
    if (!window.confirm(confirmText)) return
    setOfferActionId(offerId)
    try {
      const res = await exchangeAPI[action](offerId)
      alert(res.data?.message || '操作成功')
      loadData()
    } catch (error: any) {
      alert(error.response?.data?.error || '操作失败，请稍后重试')
      loadData()
    } finally {
      setOfferActionId(null)
    }
  }

  const renderOfferCard = (offer: any, perspective: 'received' | 'sent') => {
    const status = offerStatusMap[offer.status] || offerStatusMap.pending
    const isMine = perspective === 'sent'
    const myConfirmed = isMine ? offer.requester_confirmed : offer.seller_confirmed
    const otherConfirmed = isMine ? offer.seller_confirmed : offer.requester_confirmed
    const acting = offerActionId === offer.id

    return (
      <div key={offer.id} className="bg-white rounded-2xl p-4 mb-4">
        <div className="flex items-center justify-between mb-3">
          <span className="text-sm text-gray-500">
            {isMine ? `发给卖家: ${offer.seller_name}` : `来自买家: ${offer.requester_name}`}
          </span>
          <span className={`px-2 py-1 rounded-full text-xs font-medium ${status.color}`}>
            {status.label}
          </span>
        </div>

        <div className="flex items-center gap-3">
          <div className="flex-1 min-w-0">
            <img
              src={offer.offered_photos?.[0] || 'https://picsum.photos/200/200'}
              alt={offer.offered_name}
              className="w-16 h-16 rounded-xl object-cover mb-1"
            />
            <p className="text-sm font-medium text-gray-900 truncate">{offer.offered_name}</p>
            <p className="text-xs text-gray-500">¥{offer.offered_price}</p>
            <p className="text-xs text-purple-500 mt-0.5">{isMine ? '我的商品' : '对方商品'}</p>
          </div>

          <ArrowLeftRight className="w-5 h-5 text-gray-400 flex-shrink-0" />

          <div className="flex-1 min-w-0 text-right">
            <img
              src={offer.target_photos?.[0] || 'https://picsum.photos/200/200'}
              alt={offer.target_name}
              className="w-16 h-16 rounded-xl object-cover mb-1 ml-auto"
            />
            <p className="text-sm font-medium text-gray-900 truncate">{offer.target_name}</p>
            <p className="text-xs text-gray-500">¥{offer.target_price}</p>
            <p className="text-xs text-pink-500 mt-0.5">{isMine ? '想换的商品' : '我的商品'}</p>
          </div>
        </div>

        {offer.status === 'accepted' && (
          <p className="text-xs text-blue-500 mt-3">
            {myConfirmed
              ? '我已确认完成，等待对方确认'
              : otherConfirmed
                ? '对方已确认完成，请尽快确认'
                : '交换进行中，收到对方商品后请确认完成'}
          </p>
        )}
        {offer.status === 'invalid' && (
          <p className="text-xs text-gray-400 mt-3">该报价已失效，不能恢复</p>
        )}

        {(offer.status === 'pending' || offer.status === 'accepted') && (
          <div className="flex gap-2 mt-4 pt-4 border-t border-gray-100">
            {offer.status === 'pending' && perspective === 'received' && (
              <>
                <button
                  onClick={() => handleOfferAction(offer.id, 'reject', '确定拒绝该交换报价吗？')}
                  disabled={acting}
                  className="flex-1 py-2 bg-gray-100 text-gray-600 rounded-xl font-medium hover:bg-gray-200 transition-all disabled:opacity-50 flex items-center justify-center gap-1"
                >
                  <X className="w-4 h-4" />
                  拒绝
                </button>
                <button
                  onClick={() =>
                    handleOfferAction(offer.id, 'accept', '接受后两件商品将进入交易中，其余竞争报价自动失效，确定接受吗？')
                  }
                  disabled={acting}
                  className="flex-1 py-2 bg-purple-500 text-white rounded-xl font-medium hover:bg-purple-600 transition-all disabled:opacity-50 flex items-center justify-center gap-1"
                >
                  <Check className="w-4 h-4" />
                  接受
                </button>
              </>
            )}
            {offer.status === 'pending' && perspective === 'sent' && (
              <button
                onClick={() => handleOfferAction(offer.id, 'cancel', '确定取消该交换报价吗？')}
                disabled={acting}
                className="flex-1 py-2 bg-gray-100 text-gray-600 rounded-xl font-medium hover:bg-gray-200 transition-all disabled:opacity-50 flex items-center justify-center gap-1"
              >
                <X className="w-4 h-4" />
                取消报价
              </button>
            )}
            {offer.status === 'accepted' && (
              <>
                <button
                  onClick={() =>
                    handleOfferAction(offer.id, 'cancel', '取消后两件商品将恢复在售，已失效的报价不会恢复，确定取消交换吗？')
                  }
                  disabled={acting}
                  className="flex-1 py-2 bg-gray-100 text-gray-600 rounded-xl font-medium hover:bg-gray-200 transition-all disabled:opacity-50 flex items-center justify-center gap-1"
                >
                  <X className="w-4 h-4" />
                  取消交换
                </button>
                <button
                  onClick={() => handleOfferAction(offer.id, 'confirm', '确认已完成交换吗？双方确认后商品将标记为已交换')}
                  disabled={acting || !!myConfirmed}
                  className="flex-1 py-2 bg-purple-500 text-white rounded-xl font-medium hover:bg-purple-600 transition-all disabled:opacity-50 flex items-center justify-center gap-1"
                >
                  <CheckCircle className="w-4 h-4" />
                  {myConfirmed ? '已确认' : '确认完成'}
                </button>
              </>
            )}
          </div>
        )}
      </div>
    )
  }

  const renderOrderCard = (order: any, isSeller: boolean) => {
    const status = statusMap[order.status] || statusMap.pending
    return (
      <div key={order.id} className="bg-white rounded-2xl p-4 mb-4">
        <div className="flex items-start gap-4">
          <img
            src={order.photos?.[0] || 'https://picsum.photos/200/200'}
            alt={order.product_name}
            className="w-20 h-20 rounded-xl object-cover"
          />
          <div className="flex-1 min-w-0">
            <div className="flex items-start justify-between">
              <h3 className="font-medium text-gray-900 truncate">
                {order.product_name}
              </h3>
              <span className={`px-2 py-1 rounded-full text-xs font-medium ${status.color}`}>
                {status.label}
              </span>
            </div>
            <p className="text-purple-600 font-semibold mt-1">¥{order.price}</p>
            <p className="text-sm text-gray-500 mt-1">
              {typeMap[order.type] || order.type} · {isSeller ? `买家: ${order.buyer_name}` : `卖家: ${order.seller_name}`}
            </p>
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
        </div>
      </div>
    )
  }

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
            { id: 'exchange', label: '交换报价', icon: RefreshCw },
          ].map((tab) => {
            const Icon = tab.icon
            return (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id as any)}
                className={`flex-1 py-2.5 rounded-lg text-sm font-medium transition-all flex items-center justify-center gap-1.5 ${
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
          boughtOrders.length === 0 ? (
            <div className="text-center py-16">
              <ShoppingCart className="w-16 h-16 text-gray-300 mx-auto mb-4" />
              <p className="text-gray-500">还没有买到任何商品</p>
              <Link to="/" className="text-purple-500 hover:underline mt-2 inline-block">
                去逛逛
              </Link>
            </div>
          ) : (
            boughtOrders.map((order) => renderOrderCard(order, false))
          )
        ) : activeTab === 'sold' ? (
          soldOrders.length === 0 ? (
            <div className="text-center py-16">
              <Package className="w-16 h-16 text-gray-300 mx-auto mb-4" />
              <p className="text-gray-500">还没有卖出任何商品</p>
            </div>
          ) : (
            soldOrders.map((order) => renderOrderCard(order, true))
          )
        ) : activeTab === 'exchange' ? (
          <div>
            <div className="flex gap-2 mb-4">
              {[
                { id: 'received', label: `收到的报价 (${receivedOffers.length})` },
                { id: 'sent', label: `我发起的 (${sentOffers.length})` },
              ].map((sub) => (
                <button
                  key={sub.id}
                  onClick={() => setExchangeSubTab(sub.id as 'received' | 'sent')}
                  className={`flex-1 py-2 rounded-xl text-sm font-medium transition-all ${
                    exchangeSubTab === sub.id
                      ? 'bg-white text-purple-600 shadow-sm'
                      : 'text-gray-500 hover:text-gray-700'
                  }`}
                >
                  {sub.label}
                </button>
              ))}
            </div>
            {exchangeSubTab === 'received' ? (
              receivedOffers.length === 0 ? (
                <div className="text-center py-16">
                  <RefreshCw className="w-16 h-16 text-gray-300 mx-auto mb-4" />
                  <p className="text-gray-500">还没有收到交换报价</p>
                </div>
              ) : (
                receivedOffers.map((offer) => renderOfferCard(offer, 'received'))
              )
            ) : sentOffers.length === 0 ? (
              <div className="text-center py-16">
                <RefreshCw className="w-16 h-16 text-gray-300 mx-auto mb-4" />
                <p className="text-gray-500">还没有发起过交换</p>
                <Link to="/" className="text-purple-500 hover:underline mt-2 inline-block">
                  去逛逛
                </Link>
              </div>
            ) : (
              sentOffers.map((offer) => renderOfferCard(offer, 'sent'))
            )}
          </div>
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
            {products.map((product) => (
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
                  <span className={`inline-block mt-1 px-2 py-0.5 rounded-full text-xs font-medium ${
                    (productStatusMap[product.status] || productStatusMap.sold).color
                  }`}>
                    {(productStatusMap[product.status] || productStatusMap.sold).label}
                  </span>
                </div>
                <ChevronRight className="w-5 h-5 text-gray-400" />
              </Link>
            ))}
          </div>
        )}
      </main>
    </div>
  )
}
