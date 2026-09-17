import { useState, useEffect } from 'react'
import { useParams, useNavigate, Link } from 'react-router-dom'
import { productAPI, orderAPI, exchangeAPI } from '../lib/api'
import { useAuthStore } from '../store/auth'
import {
  ArrowLeft,
  Star,
  User,
  ChevronLeft,
  ChevronRight,
  ShoppingCart,
  RefreshCw,
  Tag,
  Package,
  Info,
  X,
  AlertCircle,
  Clock,
  CheckCircle,
  Ban,
} from 'lucide-react'

const conditionMap: Record<string, string> = {
  new: '全新',
  like_new: '几乎全新',
  good: '品相良好',
  fair: '一般',
}

const categoryMap: Record<string, string> = {
  figure: '手办',
  badge: '吧唧',
  card: '卡牌',
  poster: '海报',
  book: '漫画',
  clothing: '服饰',
  other: '其他',
}

const productStatusMap: Record<string, { label: string; cls: string }> = {
  active: { label: '在售中', cls: 'bg-green-100 text-green-700' },
  trading: { label: '交易中', cls: 'bg-orange-100 text-orange-700' },
  sold: { label: '已售出', cls: 'bg-gray-200 text-gray-500' },
}

const offerStatusMap: Record<
  string,
  { label: string; cls: string; icon: typeof Clock }
> = {
  pending: { label: '待卖家回复', cls: 'bg-orange-50 text-orange-600', icon: Clock },
  accepted: {
    label: '卖家已接受 · 交易中',
    cls: 'bg-green-50 text-green-600',
    icon: CheckCircle,
  },
  rejected: { label: '卖家已拒绝', cls: 'bg-gray-100 text-gray-500', icon: Ban },
  cancelled: { label: '已撤销', cls: 'bg-gray-100 text-gray-500', icon: Ban },
  expired: { label: '已失效', cls: 'bg-red-50 text-red-500', icon: AlertCircle },
}

export default function ProductDetail() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const [product, setProduct] = useState<any>(null)
  const [currentPhoto, setCurrentPhoto] = useState(0)
  const [loading, setLoading] = useState(true)
  const [buying, setBuying] = useState(false)
  const [exchangeOpen, setExchangeOpen] = useState(false)
  const [myProducts, setMyProducts] = useState<any[]>([])
  const [myOffer, setMyOffer] = useState<any>(null)
  const { isAuthenticated, user } = useAuthStore()

  useEffect(() => {
    loadProduct()
  }, [id])

  const loadProduct = async () => {
    setLoading(true)
    try {
      const res = await productAPI.getProduct(parseInt(id!))
      setProduct(res.data.data)
      setCurrentPhoto(0)
      setMyOffer(null)
      if (isAuthenticated) {
        loadMyOffer()
      }
    } catch (error) {
      console.error('Failed to load product:', error)
      setProduct(null)
    } finally {
      setLoading(false)
    }
  }

  const loadMyOffer = async () => {
    try {
      const res = await exchangeAPI.getMyOffers(parseInt(id!))
      const list = res.data.data || []
      // 同一商品只可能有一笔待处理报价；否则展示最近一笔
      const pending = list.find((o: any) => o.status === 'pending')
      setMyOffer(pending || list[0] || null)
    } catch (error) {
      // 未登录或接口异常时静默处理
      console.error('Failed to load my offer:', error)
    }
  }

  const loadMyProducts = async () => {
    try {
      const res = await productAPI.getMyProducts()
      // 只能选择自己的在售商品发起交换
      setMyProducts(
        (res.data.data || []).filter(
          (p: any) => p.status === 'active' && p.id !== parseInt(id!),
        ),
      )
    } catch (error) {
      console.error('Failed to load my products:', error)
      setMyProducts([])
    }
  }

  const openExchange = async () => {
    if (!isAuthenticated) {
      navigate('/login')
      return
    }
    await loadMyProducts()
    setExchangeOpen(true)
  }

  const handleBuy = async () => {
    if (!isAuthenticated) {
      navigate('/login')
      return
    }

    setBuying(true)
    try {
      await orderAPI.createOrder({
        product_id: parseInt(id!),
        type: 'buy',
        price: product.price,
      })
      alert('下单成功！请在订单管理中查看')
      navigate('/profile')
    } catch (error: any) {
      alert(error.response?.data?.error || '操作失败')
    } finally {
      setBuying(false)
    }
  }

  const handleCancelOffer = async () => {
    if (!myOffer) return
    if (!confirm('确定撤销这笔交换请求吗？')) return
    try {
      await exchangeAPI.cancelOffer(myOffer.id)
      alert('已撤销交换请求')
      loadMyOffer()
    } catch (error: any) {
      alert(error.response?.data?.error || '撤销失败')
    }
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="animate-pulse text-gray-400">加载中...</div>
      </div>
    )
  }

  if (!product) {
    return (
      <div className="min-h-screen bg-gray-50 flex flex-col items-center justify-center">
        <p className="text-gray-500 mb-4">商品不存在</p>
        <Link to="/" className="text-purple-500 hover:underline">
          返回首页
        </Link>
      </div>
    )
  }

  const isOwner = isAuthenticated && user?.id === product.seller_id
  const productStatus = productStatusMap[product.status] || productStatusMap.active
  const offerStatus = myOffer ? offerStatusMap[myOffer.status] : null
  const OfferIcon = offerStatus?.icon || Clock
  const canTrade = product.status === 'active' && !isOwner
  const pendingOffer = myOffer?.status === 'pending'

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="bg-white shadow-sm sticky top-0 z-40">
        <div className="max-w-4xl mx-auto px-4 py-4">
          <div className="flex items-center gap-4">
            <Link
              to="/"
              className="w-10 h-10 flex items-center justify-center rounded-xl hover:bg-gray-100 transition-all"
            >
              <ArrowLeft className="w-5 h-5 text-gray-600" />
            </Link>
            <h1 className="text-xl font-bold text-gray-900 truncate">
              {product.name}
            </h1>
          </div>
        </div>
      </header>

      <main className="max-w-4xl mx-auto px-4 py-6 pb-28">
        {/* 商品交易状态提示 */}
        {product.status !== 'active' && (
          <div className={`mb-4 px-4 py-3 rounded-xl flex items-center gap-2 text-sm font-medium ${productStatus.cls}`}>
            <AlertCircle className="w-4 h-4" />
            {product.status === 'trading'
              ? '该商品正在交换交易中，暂不可下单或发起交换'
              : '该商品已售出'}
          </div>
        )}

        {/* 我的交换报价状态 */}
        {myOffer && offerStatus && (
          <div className={`mb-4 rounded-xl p-4 ${offerStatus.cls}`}>
            <div className="flex items-center justify-between gap-3">
              <div className="flex items-center gap-2 font-medium">
                <OfferIcon className="w-4 h-4" />
                <span>我的交换请求：{offerStatus.label}</span>
              </div>
              <div className="flex items-center gap-2">
                {myOffer.status === 'accepted' && (
                  <Link
                    to="/profile"
                    className="text-sm font-medium underline whitespace-nowrap"
                  >
                    查看订单
                  </Link>
                )}
                {pendingOffer && (
                  <button
                    onClick={handleCancelOffer}
                    className="text-sm px-3 py-1 rounded-lg bg-white/70 hover:bg-white transition-all whitespace-nowrap"
                  >
                    撤销请求
                  </button>
                )}
              </div>
            </div>
            <div className="mt-2 flex items-center gap-2 text-sm opacity-90">
              <RefreshCw className="w-3.5 h-3.5" />
              <span className="truncate">
                用「{myOffer.offered_product_name}」交换此商品
              </span>
            </div>
          </div>
        )}

        <div className="bg-white rounded-2xl overflow-hidden mb-6">
          <div className="relative aspect-square">
            <img
              src={product.photos[currentPhoto] || 'https://picsum.photos/800/800'}
              alt={product.name}
              className="w-full h-full object-cover"
            />
            {product.photos.length > 1 && (
              <>
                <button
                  onClick={() =>
                    setCurrentPhoto(
                      (prev) =>
                        (prev - 1 + product.photos.length) % product.photos.length
                    )
                  }
                  className="absolute left-3 top-1/2 -translate-y-1/2 w-10 h-10 bg-white/90 rounded-full flex items-center justify-center shadow-lg hover:bg-white transition-all"
                >
                  <ChevronLeft className="w-6 h-6 text-gray-700" />
                </button>
                <button
                  onClick={() =>
                    setCurrentPhoto(
                      (prev) => (prev + 1) % product.photos.length
                    )
                  }
                  className="absolute right-3 top-1/2 -translate-y-1/2 w-10 h-10 bg-white/90 rounded-full flex items-center justify-center shadow-lg hover:bg-white transition-all"
                >
                  <ChevronRight className="w-6 h-6 text-gray-700" />
                </button>
              </>
            )}
            <div className="absolute top-4 left-4">
              <span className={`px-3 py-1 rounded-full text-sm font-medium ${productStatus.cls}`}>
                {productStatus.label}
              </span>
            </div>
            <div className="absolute bottom-4 left-1/2 -translate-x-1/2 flex gap-2">
              {product.photos.map((_: string, i: number) => (
                <button
                  key={i}
                  onClick={() => setCurrentPhoto(i)}
                  className={`w-2 h-2 rounded-full transition-all ${
                    i === currentPhoto ? 'bg-white w-6' : 'bg-white/50'
                  }`}
                />
              ))}
            </div>
          </div>
        </div>

        <div className="bg-white rounded-2xl p-6 mb-6">
          <div className="flex items-start justify-between mb-4">
            <div>
              <h2 className="text-2xl font-bold text-gray-900 mb-2">
                {product.name}
              </h2>
              <p className="text-3xl font-bold text-purple-600">
                ¥{product.price}
              </p>
            </div>
            <span className="px-3 py-1 bg-purple-100 text-purple-600 rounded-full text-sm font-medium">
              {categoryMap[product.category] || product.category}
            </span>
          </div>

          <div className="space-y-3">
            <div className="flex items-center gap-2 text-gray-600">
              <Tag className="w-4 h-4" />
              <span className="font-medium">IP:</span>
              <span>{product.ip_name}</span>
              {product.character_name && (
                <>
                  <span className="text-gray-300">|</span>
                  <span className="font-medium">角色:</span>
                  <span>{product.character_name}</span>
                </>
              )}
            </div>
            <div className="flex items-center gap-2 text-gray-600">
              <Package className="w-4 h-4" />
              <span className="font-medium">新旧:</span>
              <span>{conditionMap[product.condition] || product.condition}</span>
            </div>
            {product.exchange_intent && (
              <div className="flex items-start gap-2 text-gray-600">
                <RefreshCw className="w-4 h-4 mt-0.5" />
                <span className="font-medium">交换意向:</span>
                <span>{product.exchange_intent}</span>
              </div>
            )}
          </div>
        </div>

        {product.description && (
          <div className="bg-white rounded-2xl p-6 mb-6">
            <h3 className="font-bold text-gray-900 mb-3 flex items-center gap-2">
              <Info className="w-4 h-4" />
              商品描述
            </h3>
            <p className="text-gray-600 leading-relaxed">{product.description}</p>
          </div>
        )}

        <div className="bg-white rounded-2xl p-6">
          <h3 className="font-bold text-gray-900 mb-3">卖家信息</h3>
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 bg-gradient-to-r from-purple-400 to-pink-400 rounded-xl flex items-center justify-center">
              <User className="w-6 h-6 text-white" />
            </div>
            <div>
              <p className="font-medium text-gray-900">{product.seller_name}</p>
              <div className="flex items-center gap-1 text-sm text-gray-500">
                <Star className="w-4 h-4 text-yellow-400 fill-yellow-400" />
                <span>{product.seller_rating || 0}</span>
                <span className="text-gray-300">·</span>
                <span>{product.seller_review_count || 0}条评价</span>
              </div>
            </div>
          </div>
        </div>
      </main>

      <div className="fixed bottom-0 left-0 right-0 bg-white border-t border-gray-200 px-4 py-3">
        <div className="max-w-4xl mx-auto flex gap-3">
          {isOwner ? (
            <div className="flex-1 py-3.5 text-center text-gray-400 font-medium">
              这是你发布的商品
            </div>
          ) : (
            <>
              <button
                onClick={openExchange}
                disabled={buying || !canTrade || pendingOffer}
                title={
                  !canTrade
                    ? '商品当前不可交换'
                    : pendingOffer
                      ? '已有一笔待回复的交换请求'
                      : ''
                }
                className="flex-1 py-3.5 bg-pink-50 text-pink-600 rounded-xl font-medium hover:bg-pink-100 transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
              >
                <RefreshCw className="w-5 h-5" />
                {pendingOffer ? '交换请求待回复' : '想要交换'}
              </button>
              <button
                onClick={handleBuy}
                disabled={buying || !canTrade}
                className="flex-1 py-3.5 bg-gradient-to-r from-purple-500 to-pink-500 text-white rounded-xl font-medium hover:opacity-90 transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
              >
                <ShoppingCart className="w-5 h-5" />
                立即购买
              </button>
            </>
          )}
        </div>
      </div>

      {exchangeOpen && (
        <ExchangeModal
          myProducts={myProducts}
          onClose={() => setExchangeOpen(false)}
          onSuccess={() => {
            setExchangeOpen(false)
            loadMyOffer()
          }}
        />
      )}
    </div>
  )
}

function ExchangeModal({
  myProducts,
  onClose,
  onSuccess,
}: {
  myProducts: any[]
  onClose: () => void
  onSuccess: () => void
}) {
  const { id } = useParams<{ id: string }>()
  const [selectedId, setSelectedId] = useState<number | null>(null)
  const [submitting, setSubmitting] = useState(false)

  const handleSubmit = async () => {
    if (!selectedId) {
      alert('请先选择一件你的在售商品')
      return
    }
    setSubmitting(true)
    try {
      const res = await exchangeAPI.createOffer({
        target_product_id: parseInt(id!),
        offered_product_id: selectedId,
      })
      alert(res.data?.message || '交换请求已发送，请等待卖家回复')
      onSuccess()
    } catch (error: any) {
      alert(error.response?.data?.error || '发起交换失败')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center">
      <div
        className="absolute inset-0 bg-black/40"
        onClick={submitting ? undefined : onClose}
      />
      <div className="relative w-full sm:max-w-lg bg-white rounded-t-3xl sm:rounded-3xl max-h-[85vh] flex flex-col">
        <div className="flex items-center justify-between px-6 py-5 border-b border-gray-100">
          <div>
            <h3 className="text-lg font-bold text-gray-900 flex items-center gap-2">
              <RefreshCw className="w-5 h-5 text-pink-500" />
              发起以物换物
            </h3>
            <p className="text-sm text-gray-500 mt-1">
              选择一件你的在售商品与卖家交换，卖家接受后两件商品将同时进入交易中
            </p>
          </div>
          <button
            onClick={onClose}
            disabled={submitting}
            className="p-2 hover:bg-gray-100 rounded-xl transition-all"
          >
            <X className="w-5 h-5 text-gray-500" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-6 py-4">
          {myProducts.length === 0 ? (
            <div className="text-center py-12">
              <Package className="w-14 h-14 text-gray-300 mx-auto mb-3" />
              <p className="text-gray-500 font-medium">你还没有可用于交换的在售商品</p>
              <p className="text-gray-400 text-sm mt-1">
                交易中或已售出的商品不能用于交换
              </p>
              <Link
                to="/publish"
                className="inline-block mt-4 px-4 py-2 bg-gradient-to-r from-purple-500 to-pink-500 text-white rounded-xl text-sm font-medium"
              >
                去发布商品
              </Link>
            </div>
          ) : (
            <div className="space-y-3">
              {myProducts.map((p) => (
                <button
                  key={p.id}
                  onClick={() => setSelectedId(p.id)}
                  className={`w-full flex items-center gap-3 p-3 rounded-2xl border-2 text-left transition-all ${
                    selectedId === p.id
                      ? 'border-pink-400 bg-pink-50'
                      : 'border-gray-100 hover:border-gray-200'
                  }`}
                >
                  <img
                    src={p.photos?.[0] || 'https://picsum.photos/200/200'}
                    alt={p.name}
                    className="w-16 h-16 rounded-xl object-cover"
                  />
                  <div className="flex-1 min-w-0">
                    <p className="font-medium text-gray-900 truncate">{p.name}</p>
                    <p className="text-purple-600 font-semibold text-sm mt-0.5">
                      ¥{p.price}
                    </p>
                    <p className="text-xs text-gray-400 truncate">
                      {p.ip_name}
                    </p>
                  </div>
                  <div
                    className={`w-5 h-5 rounded-full border-2 flex items-center justify-center ${
                      selectedId === p.id
                        ? 'border-pink-500 bg-pink-500'
                        : 'border-gray-300'
                    }`}
                  >
                    {selectedId === p.id && (
                      <CheckCircle className="w-3.5 h-3.5 text-white" />
                    )}
                  </div>
                </button>
              ))}
            </div>
          )}
        </div>

        <div className="px-6 py-4 border-t border-gray-100">
          <button
            onClick={handleSubmit}
            disabled={submitting || myProducts.length === 0 || !selectedId}
            className="w-full py-3.5 bg-gradient-to-r from-pink-500 to-purple-500 text-white rounded-xl font-medium hover:opacity-90 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {submitting ? '提交中...' : '确认发起交换'}
          </button>
        </div>
      </div>
    </div>
  )
}
