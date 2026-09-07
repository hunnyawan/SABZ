import { useEffect, useState, useCallback, useRef } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { communityApi } from '@/api/communityApi';
import { marketplaceApi } from '@/api/marketplaceApi';
import { inboxApi } from '@/api/inboxApi';
import { parseApiError } from '@/api/client';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Badge } from '@/components/ui/Badge';
import { EmptyState, ErrorState } from '@/components/ui/EmptyState';
import { PageSkeleton } from '@/components/ui/Skeleton';
import { formatDate, cn } from '@/lib/utils';
import { t, isRtl } from '@/lib/i18n';
import { useAuth } from '@/hooks/useAuth';
import {
  Users, MessageSquare, Send, Image, Trash2, Store, Tag,
  MapPin, Package, Clock, Search, Heart, Mail,
  ChevronDown, X, Camera, Sprout, Upload, Check,
} from 'lucide-react';
import type {
  CommunityPostResponseDto,
  CommunityCommentResponseDto,
  MarketplaceListingSummaryDto,
  MarketplaceConversationSummaryDto,
  PagedResultDto,
  MarketplacePagedResultDto,
  MarketplaceInboxPagedResultDto,
} from '@/types';

type Tab = 'feed' | 'messages';
type FeedFilter = 'all' | 'posts' | 'listings';

/**
 * Detect whether a string contains Urdu / Arabic script characters.
 * Covers the main Arabic Unicode block (U+0600–U+06FF) which includes
 * Urdu-specific letters like ے ، ة ، ڈ ، ڑ ، ں ، ہ and punctuation
 * like ؟ (U+061F). Used to auto-apply RTL direction and Urdu font.
 */
function containsUrduScript(text: string): boolean {
  return /[\u0600-\u06FF\u0750-\u077F\uFB50-\uFDFF\uFE70-\uFEFF]/.test(text);
}

/** Check whether a string is a valid non-empty GUID. */
function isValidGuid(id: string | undefined | null): boolean {
  return !!id && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id);
}

/**
 * Generate a deterministic mock GUID from a seed string so the same author
 * always maps to the same fake id. Used as a fallback when the backend
 * hasn't yet exposed authorId on community DTOs.
 */
function mockGuidFrom(seed: string): string {
  let h = 0;
  for (let i = 0; i < seed.length; i++) {
    h = ((h << 5) - h + seed.charCodeAt(i)) | 0;
  }
  const hex = Math.abs(h).toString(16).padStart(8, '0').slice(0, 8);
  return `${hex}-0000-4000-8000-000000000000`;
}

/** Deterministic mock location from author name for display purposes. */
const MOCK_LOCATIONS = [
  'Sahiwal', 'Multan', 'Faisalabad', 'Lahore', 'Rahim Yar Khan',
  'Bahawalpur', 'Sargodha', 'Dera Ghazi Khan', 'Sheikhupura', 'Okara',
  'Khanewal', 'Jhang', 'Vehari', 'Kasur', 'Muzaffargarh',
];
function mockLocationFrom(name: string): string {
  let h = 0;
  for (let i = 0; i < name.length; i++) h = ((h << 5) - h + name.charCodeAt(i)) | 0;
  return MOCK_LOCATIONS[Math.abs(h) % MOCK_LOCATIONS.length];
}

/**
 * Store a simulated direct message in localStorage so it survives
 * navigation. Keyed by the recipient name for easy retrieval later.
 */
function storeLocalMessage(recipientName: string, message: string) {
  try {
    const key = 'sabz_local_messages';
    const existing = JSON.parse(localStorage.getItem(key) || '[]') as Array<{
      recipient: string; message: string; at: string;
    }>;
    existing.push({ recipient: recipientName, message, at: new Date().toISOString() });
    localStorage.setItem(key, JSON.stringify(existing));
  } catch { /* storage full or unavailable — silently ignore */ }
}

/* ─── Dummy Marketplace Listings ───────────────────────────────────── */

const DUMMY_LISTINGS: MarketplaceListingSummaryDto[] = [
  {
    id: 'dummy-0001-0000-0000-000000000001',
    title: 'Massey Ferguson 240 Tractor (2021 Model)',
    category: 'Tractors & Machinery',
    listingType: 'Sale',
    description: 'Well-maintained MF 240, 55HP, 4-cylinder diesel engine. Single owner, complete service history available. Tyres in excellent condition. Ideal for 12–25 acre farms.',
    price: 1450000,
    priceUnit: 'unit',
    location: 'Faisalabad',
    condition: 'Used',
    availability: 'Available',
    imageUrl: null,
    createdAt: '2026-09-04T10:30:00Z',
    sellerName: 'Ahmad Raza',
    isOwnedByCurrentUser: false,
  },
  {
    id: 'dummy-0001-0000-0000-000000000002',
    title: 'Laser Land Leveler with Transmitter',
    category: 'Implements',
    listingType: 'Sale',
    description: 'Imported laser leveler with full transmitter kit. 8ft blade width, hydraulic depth control. Suitable for wheat and rice field preparation. Less than 50 acres of use.',
    price: 320000,
    priceUnit: 'unit',
    location: 'Multan',
    condition: 'Used',
    availability: 'Available',
    imageUrl: null,
    createdAt: '2026-09-03T14:15:00Z',
    sellerName: 'Hassan Ali',
    isOwnedByCurrentUser: false,
  },
  {
    id: 'dummy-0001-0000-0000-000000000003',
    title: 'Certified Wheat Seed (Td-1) — 50kg Bags',
    category: 'Seeds & Fertilizer',
    listingType: 'Sale',
    description: 'Government certified Td-1 wheat seed. High germination rate (95%+). Ideal for Punjab planting season. Bulk orders welcome with delivery.',
    price: 5200,
    priceUnit: 'bag',
    location: 'Sahiwal',
    condition: 'New',
    availability: 'Available',
    imageUrl: null,
    createdAt: '2026-09-05T08:00:00Z',
    sellerName: 'Punjab Seed Corporation',
    isOwnedByCurrentUser: false,
  },
  {
    id: 'dummy-0001-0000-0000-000000000004',
    title: 'Pure Sahiwal Breed Dairy Cow (14L Daily)',
    category: 'Livestock & Feed',
    listingType: 'Sale',
    description: 'Pure Sahiwal breed, 3rd calving, 14 litres daily yield. Healthy and vaccinated. With calf. Documented pedigree available. Suitable for small dairy setup.',
    price: 380000,
    priceUnit: 'head',
    location: 'Pakpattan',
    condition: 'Healthy',
    availability: 'Available',
    imageUrl: null,
    createdAt: '2026-09-04T16:45:00Z',
    sellerName: 'Muhammad Iqbal',
    isOwnedByCurrentUser: false,
  },
  {
    id: 'dummy-0001-0000-0000-000000000005',
    title: '15HP Solar Tube Well Inverter & Structure',
    category: 'Solar Systems',
    listingType: 'Sale',
    description: 'Complete solar tube well system: 15HP inverter, 12 panels (550W each), mounting structure, and wiring. Installed for 2 years, excellent working condition. Saves PKR 40K+ monthly vs diesel.',
    price: 450000,
    priceUnit: 'set',
    location: 'Sargodha',
    condition: 'Used',
    availability: 'Available',
    imageUrl: null,
    createdAt: '2026-09-02T11:20:00Z',
    sellerName: 'Bilal Farms',
    isOwnedByCurrentUser: false,
  },
  {
    id: 'dummy-0001-0000-0000-000000000006',
    title: 'Boom Sprayer 600L Tank (Imported Nozzles)',
    category: 'Pesticides & Sprayers',
    listingType: 'Sale',
    description: '600-litre boom sprayer with 18ft boom, imported Italian nozzles, pressure regulator. Tractor-mounted. Uniform spray coverage for wheat, cotton, sugarcane.',
    price: 175000,
    priceUnit: 'unit',
    location: 'Khanewal',
    condition: 'New',
    availability: 'Available',
    imageUrl: null,
    createdAt: '2026-09-05T06:30:00Z',
    sellerName: 'Agri Equipment Hub',
    isOwnedByCurrentUser: false,
  },
  {
    id: 'dummy-0001-0000-0000-000000000007',
    title: 'DAP Fertilizer (50kg Bags) — Import Quality',
    category: 'Seeds & Fertilizer',
    listingType: 'Sale',
    description: 'High-quality imported DAP fertilizer, 50kg bags. 18% Phosphorus, 46% Nitrogen. Available in bulk quantities. Delivery across South Punjab.',
    price: 12800,
    priceUnit: 'bag',
    location: 'Bahawalpur',
    condition: 'New',
    availability: 'Available',
    imageUrl: null,
    createdAt: '2026-09-01T09:00:00Z',
    sellerName: 'Fertile Land Traders',
    isOwnedByCurrentUser: false,
  },
  {
    id: 'dummy-0001-0000-0000-000000000008',
    title: 'Cotton Picker (Self-Propelled) — John Deere 7760',
    category: 'Harvesting Equipment',
    listingType: 'Sale',
    description: 'John Deere 7760 cotton picker, round module builder. 2019 model, 1200 hectares capacity. Well maintained with complete service records. Ideal for large cotton farms.',
    price: 2850000,
    priceUnit: 'unit',
    location: 'Rahim Yar Khan',
    condition: 'Used',
    availability: 'Available',
    imageUrl: null,
    createdAt: '2026-09-03T07:45:00Z',
    sellerName: 'Siddique Agri Services',
    isOwnedByCurrentUser: false,
  },
];

/* ─── Local-storage helpers for user-created listings ──────────────── */

const USER_LISTINGS_KEY = 'sabz_user_listings';

function getUserListings(): MarketplaceListingSummaryDto[] {
  try {
    return JSON.parse(localStorage.getItem(USER_LISTINGS_KEY) || '[]') as MarketplaceListingSummaryDto[];
  } catch { return []; }
}

function addUserListing(listing: MarketplaceListingSummaryDto) {
  const existing = getUserListings();
  existing.unshift(listing);
  localStorage.setItem(USER_LISTINGS_KEY, JSON.stringify(existing));
}

/* ─── Local conversation management (fallback when API unavailable) ── */

interface LocalConversation {
  conversationId: string;
  listingId?: string | null;
  listingTitle?: string | null;
  otherParticipantName: string;
  sellerName: string;
  buyerName: string;
  role: string;
  latestMessagePreview?: string | null;
  latestMessageAt?: string | null;
  messages: Array<{
    messageId: string;
    senderName: string;
    content: string;
    createdAt: string;
    isOwnMessage: boolean;
  }>;
}

const LOCAL_CONVERSATIONS_KEY = 'sabz_local_conversations';

function getLocalConversations(): LocalConversation[] {
  try {
    return JSON.parse(localStorage.getItem(LOCAL_CONVERSATIONS_KEY) || '[]') as LocalConversation[];
  } catch { return []; }
}

function saveLocalConversations(convs: LocalConversation[]) {
  localStorage.setItem(LOCAL_CONVERSATIONS_KEY, JSON.stringify(convs));
  window.dispatchEvent(new Event('sabz:conversations:updated'));
}

/** Find an existing local conversation by seller name or listing ID. */
function findLocalConversation(sellerName: string, listingId?: string): LocalConversation | undefined {
  const convs = getLocalConversations();
  if (listingId) {
    const byListing = convs.find((c) => c.listingId === listingId);
    if (byListing) return byListing;
  }
  return convs.find((c) => c.otherParticipantName === sellerName && c.listingId === (listingId ?? null));
}

/** Create or append to a local conversation. Returns the conversation ID. */
function upsertLocalConversation(params: {
  sellerName: string;
  listingId?: string;
  listingTitle?: string;
  message: string;
  buyerName: string;
}): string {
  const { sellerName, listingId, listingTitle, message, buyerName } = params;
  const convs = getLocalConversations();

  // Check for existing conversation
  const existing = listingId
    ? convs.find((c) => c.listingId === listingId)
    : convs.find((c) => c.otherParticipantName === sellerName && !c.listingId);

  if (existing) {
    // Append message to existing thread
    existing.messages.push({
      messageId: `local-msg-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      senderName: buyerName,
      content: message,
      createdAt: new Date().toISOString(),
      isOwnMessage: true,
    });
    existing.latestMessagePreview = message;
    existing.latestMessageAt = new Date().toISOString();
    saveLocalConversations(convs);
    return existing.conversationId;
  }

  // Create new local conversation
  const convId = `local-conv-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const newConv: LocalConversation = {
    conversationId: convId,
    listingId: listingId ?? null,
    listingTitle: listingTitle ?? null,
    otherParticipantName: sellerName,
    sellerName,
    buyerName,
    role: 'Buyer',
    latestMessagePreview: message,
    latestMessageAt: new Date().toISOString(),
    messages: [{
      messageId: `local-msg-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      senderName: buyerName,
      content: message,
      createdAt: new Date().toISOString(),
      isOwnMessage: true,
    }],
  };
  convs.unshift(newConv);
  saveLocalConversations(convs);
  return convId;
}

/** Add a reply to a local conversation. */
function addLocalReply(conversationId: string, senderName: string, content: string) {
  const convs = getLocalConversations();
  const conv = convs.find((c) => c.conversationId === conversationId);
  if (!conv) return;
  conv.messages.push({
    messageId: `local-msg-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
    senderName,
    content,
    createdAt: new Date().toISOString(),
    isOwnMessage: true,
  });
  conv.latestMessagePreview = content;
  conv.latestMessageAt = new Date().toISOString();
  saveLocalConversations(convs);
}

/**
 * Kisan Network (overhauled): one unified view merging the farmer community
 * forum, the marketplace and the private inbox.
 *   - Feed tab: combined social posts + buy/sell/rent listings
 *   - Messages tab: direct conversations with buyers and sellers
 */
export function KisanNetworkPage() {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  // Tab state lives in the URL (?tab=messages) so deep links like the
  // conversation back-button land directly on the Messages tab.
  const tab: Tab = searchParams.get('tab') === 'messages' ? 'messages' : 'feed';
  const setTab = (next: Tab) => {
    if (next === tab) return;
    setSearchParams(next === 'feed' ? {} : { tab: next });
  };

  return (
    <div className="space-y-6 animate-fade-in">
      <div>
        <h1 className="text-2xl lg:text-3xl font-bold text-gray-900 flex items-center gap-3">
          <div className="h-10 w-10 rounded-xl bg-gradient-to-br from-orange-500 to-amber-600 flex items-center justify-center">
            <Users className="h-5 w-5 text-white" />
          </div>
          {t('kisan.title')}
        </h1>
        <p className="text-gray-500 mt-1 ml-0 sm:ml-[52px]">{t('kisan.description')}</p>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 bg-gray-100 rounded-xl p-1 w-fit">
        <TabButton active={tab === 'feed'} onClick={() => setTab('feed')} icon={MessageSquare}>
          {t('kisan.feed')}
        </TabButton>
        <TabButton active={tab === 'messages'} onClick={() => setTab('messages')} icon={Store}>
          {t('kisan.messages')}
        </TabButton>
      </div>

      {tab === 'feed' ? <FeedTab navigate={navigate} /> : <MessagesTab navigate={navigate} />}
    </div>
  );
}

function TabButton({
  active, onClick, icon: Icon, children,
}: { active: boolean; onClick: () => void; icon: React.ElementType; children: React.ReactNode }) {
  return (
    <button
      onClick={onClick}
      className={cn(
        'flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-colors',
        active ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-700',
      )}
    >
      <Icon className="h-4 w-4" />
      {children}
    </button>
  );
}

// ---------------------------------------------------------------------
//  Feed tab
// ---------------------------------------------------------------------

function FeedTab({ navigate }: { navigate: (to: string) => void }) {
  const [filter, setFilter] = useState<FeedFilter>('all');
  const [search, setSearch] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [showSellModal, setShowSellModal] = useState(false);

  return (
    <div className="space-y-4">
      {/* Filter chips + search + actions */}
      <div className="flex flex-col sm:flex-row sm:items-center gap-3">
        <div className="flex gap-1.5 shrink-0 overflow-x-auto pb-1 scrollbar-none">
          {(['all', 'posts', 'listings'] as FeedFilter[]).map((f) => (
            <button
              key={f}
              onClick={() => setFilter(f)}
              className={cn(
                'px-3 py-1.5 rounded-full text-xs font-medium transition-colors',
                filter === f
                  ? 'bg-primary-700 text-white'
                  : 'bg-gray-100 text-gray-600 hover:bg-gray-200',
              )}
            >
              {t(`kisan.${f}`)}
            </button>
          ))}
        </div>
        <div className="relative flex-1 min-w-0">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder={t('kisan.searchPlaceholder')}
            className="w-full pl-9 pr-8 py-2 rounded-xl border border-gray-200 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-primary-500"
          />
          {search && (
            <button
              onClick={() => setSearch('')}
              className="absolute right-2.5 top-1/2 -translate-y-1/2 p-0.5 rounded-md text-gray-400 hover:text-gray-600 hover:bg-gray-100 transition-colors"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          )}
        </div>
        <button
          onClick={() => setShowSellModal(true)}
          className="shrink-0 inline-flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs font-bold text-white bg-gradient-to-r from-emerald-600 to-green-600 hover:from-emerald-700 hover:to-green-700 shadow-sm shadow-emerald-500/20 hover:shadow-md transition-all"
        >
          <Tag className="h-3.5 w-3.5" /> {t('kisan.sellItem')}
        </button>
      </div>

      {error && <ErrorState message={error} onRetry={() => setError(null)} />}

      {filter === 'listings'
        ? <ListingsView navigate={navigate} />
        : <PostsView
            filter={filter}
            search={search}
            navigate={navigate}
          />}

      {showSellModal && (
        <SellItemModal onClose={() => setShowSellModal(false)} />
      )}
    </div>
  );
}

/** Combined "All" feed (posts + listings interleaved newest-first) or posts-only. */
function PostsView({
  filter,
  search,
  navigate,
}: {
  filter: FeedFilter;
  search: string;
  navigate: (to: string) => void;
}) {
  const { user } = useAuth();
  const userName = user?.fullName?.split(' ')[0] ?? 'Farmer';
  const [posts, setPosts] = useState<CommunityPostResponseDto[]>([]);
  const [listings, setListings] = useState<MarketplaceListingSummaryDto[]>([]);
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(true);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [content, setContent] = useState('');
  const [imageUrl, setImageUrl] = useState('');
  const [publishing, setPublishing] = useState(false);
  const [userListings, setUserListings] = useState<MarketplaceListingSummaryDto[]>(getUserListings);

  // Refresh user listings when the modal dispatches the update event
  useEffect(() => {
    const handler = () => setUserListings(getUserListings());
    window.addEventListener('sabz:listings:updated', handler);
    return () => window.removeEventListener('sabz:listings:updated', handler);
  }, []);

  const load = useCallback(async (nextPage: number, append: boolean) => {
    setLoading(true);
    setError(null);
    try {
      const postsPromise = communityApi.getPosts(nextPage, filter === 'all' ? 10 : 20);
      const listingsPromise = filter === 'all'
        ? marketplaceApi.getListings({ page: nextPage, pageSize: 10 })
        : Promise.resolve(null);

      const [postsRes, listingsRes] = await Promise.all([postsPromise, listingsPromise]);
      // Ensure every post has a valid authorId — fall back to a deterministic
      // mock GUID derived from the author name when the backend hasn't yet
      // exposed the field (e.g. older DTOs or mock data).
      const normalizedPosts = postsRes.items.map((p) => ({
        ...p,
        authorId: isValidGuid(p.authorId) ? p.authorId : mockGuidFrom(p.authorName),
      }));
      setPosts((prev) => append ? [...prev, ...normalizedPosts] : normalizedPosts);
      setListings((prev) =>
        append ? [...prev, ...(listingsRes?.items ?? [])] : (listingsRes?.items ?? []));

      const morePosts = postsRes.page < postsRes.totalPages;
      const moreListings = listingsRes ? listingsRes.page < listingsRes.totalPages : false;
      setHasMore(morePosts || moreListings);
    } catch (err) {
      setError(parseApiError(err).message);
    } finally {
      setLoading(false);
    }
  }, [filter]);

  useEffect(() => {
    setPage(1);
    setPosts([]);
    setListings([]);
    setHasMore(true);
    load(1, false);
  }, [load]);

  const handlePublish = async () => {
    if (!content.trim() || publishing) return;
    setPublishing(true);
    try {
      await communityApi.createPost(content.trim(), imageUrl.trim() || undefined);
      setContent('');
      setImageUrl('');
      setShowForm(false);
      setPage(1);
      load(1, false);
    } catch (err) {
      setError(parseApiError(err).message);
    } finally {
      setPublishing(false);
    }
  };

  const handleDeletePost = async (postId: string) => {
    if (!window.confirm(t('community.deleteConfirm'))) return;
    try {
      await communityApi.deletePost(postId);
      setPosts((prev) => prev.filter((p) => p.id !== postId));
    } catch (err) {
      setError(parseApiError(err).message);
    }
  };

  // Interleave by createdAt (newest first) in the "all" view.
  const allItems: Array<{ kind: 'post'; data: CommunityPostResponseDto } | { kind: 'listing'; data: MarketplaceListingSummaryDto }> = [
    ...posts.map((p) => ({ kind: 'post' as const, data: p })),
    ...(filter === 'all' ? [...listings, ...DUMMY_LISTINGS, ...userListings].map((l) => ({ kind: 'listing' as const, data: l })) : []),
  ].sort((a, b) => new Date(b.data.createdAt).getTime() - new Date(a.data.createdAt).getTime());

  // Client-side search filter
  const q = search.trim().toLowerCase();
  const items = q
    ? allItems.filter((item) => {
        if (item.kind === 'post') {
          const loc = mockLocationFrom(item.data.authorName).toLowerCase();
          return item.data.content.toLowerCase().includes(q)
            || item.data.authorName.toLowerCase().includes(q)
            || loc.includes(q);
        }
        return item.data.title.toLowerCase().includes(q)
          || item.data.location.toLowerCase().includes(q)
          || item.data.category.toLowerCase().includes(q)
          || item.data.sellerName.toLowerCase().includes(q);
      })
    : allItems;

  if (loading && items.length === 0) return <PageSkeleton />;

  return (
    <div className="space-y-4">
      {/* ─── Create Post Card (social-style) ─────────────────────── */}
      <div className="bg-white border border-slate-200 rounded-xl shadow-sm p-3 sm:p-4 overflow-hidden">
        {showForm ? (
          <div className="space-y-3">
            <div className="flex gap-3">
              <div className="h-10 w-10 rounded-full bg-gradient-to-br from-primary-500 to-indigo-600 flex items-center justify-center shrink-0">
                <span className="text-sm font-bold text-white">{userName.charAt(0).toUpperCase()}</span>
              </div>
              <textarea
                value={content}
                onChange={(e) => setContent(e.target.value)}
                placeholder={t('kisan.whatsOnMind')}
                maxLength={2000}
                rows={3}
                autoFocus
                className="flex-1 min-w-0 px-3 py-2 rounded-xl border border-gray-200 text-sm bg-gray-50 focus:bg-white focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-transparent resize-none transition-colors box-border"
              />
            </div>
            {/* Image URL input */}
            <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-gray-50 border border-gray-100">
              <Image className="h-4 w-4 text-gray-400 shrink-0" />
              <input
                type="url"
                value={imageUrl}
                onChange={(e) => setImageUrl(e.target.value)}
                placeholder={t('kisan.pasteImageUrl')}
                maxLength={2048}
                className="flex-1 bg-transparent text-xs text-gray-700 placeholder:text-gray-400 focus:outline-none"
              />
              {imageUrl && (
                <button onClick={() => setImageUrl('')} className="p-0.5 rounded text-gray-400 hover:text-gray-600">
                  <X className="h-3 w-3" />
                </button>
              )}
            </div>
            {/* Action row */}
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 pt-1">
              <div className="flex items-center gap-1">
                <button className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium text-emerald-700 bg-emerald-50 hover:bg-emerald-100 transition-colors">
                  <Camera className="h-3.5 w-3.5" /> {t('kisan.photoVideo')}
                </button>
                <button className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium text-orange-700 bg-orange-50 hover:bg-orange-100 transition-colors">
                  <MapPin className="h-3.5 w-3.5" /> {t('kisan.location')}
                </button>
              </div>
              <div className="flex items-center gap-2 w-full sm:w-auto">
                <button onClick={() => { setShowForm(false); setContent(''); setImageUrl(''); }} className="flex-1 sm:flex-none text-center px-3 py-1.5 rounded-lg text-xs font-medium text-gray-500 hover:bg-gray-100 transition-colors">
                  {t('common.cancel')}
                </button>
                <button
                  onClick={handlePublish}
                  disabled={!content.trim() || publishing}
                  className="flex-1 sm:flex-none flex items-center justify-center gap-1.5 px-4 py-1.5 rounded-lg text-xs font-bold text-white bg-gradient-to-r from-primary-600 to-indigo-600 hover:from-primary-700 hover:to-indigo-700 shadow-sm disabled:opacity-50 disabled:cursor-not-allowed transition-all"
                >
                  {publishing
                    ? <><div className="h-3 w-3 border-2 border-white/30 border-t-white rounded-full animate-spin" /> {t('kisan.posting')}</>
                    : <><Send className="h-3 w-3" /> {t('kisan.publishPost')}</>}
                </button>
              </div>
            </div>
          </div>
        ) : (
          <div className="flex flex-col sm:flex-row sm:items-center gap-3">
            <div className="flex items-center gap-3 w-full sm:w-auto min-w-0">
              <div className="h-10 w-10 rounded-full bg-gradient-to-br from-primary-500 to-indigo-600 flex items-center justify-center shrink-0">
                <span className="text-sm font-bold text-white">{userName.charAt(0).toUpperCase()}</span>
              </div>
              <button
                onClick={() => setShowForm(true)}
                className="flex-1 min-w-0 text-left px-4 py-2.5 rounded-full bg-gray-100 text-sm text-gray-500 hover:bg-gray-200 transition-colors truncate"
              >
                {t('kisan.whatsOnMind')}
              </button>
            </div>
            <div className="flex items-center gap-1.5 sm:shrink-0 w-full sm:w-auto">
              <button
                onClick={() => setShowForm(true)}
                className="flex-1 sm:flex-none flex items-center justify-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium text-emerald-700 bg-emerald-50 hover:bg-emerald-100 transition-colors"
              >
                <Camera className="h-3.5 w-3.5" /> {t('kisan.photo')}
              </button>
              <button
                onClick={() => setShowForm(true)}
                className="flex-1 sm:flex-none flex items-center justify-center gap-1.5 px-4 py-1.5 rounded-lg text-xs font-bold text-white bg-gradient-to-r from-primary-600 to-indigo-600 hover:from-primary-700 hover:to-indigo-700 shadow-sm transition-all"
              >
                <Sprout className="h-3.5 w-3.5" /> {t('kisan.post')}
              </button>
            </div>
          </div>
        )}
      </div>

      {items.length === 0 && !loading && (
        <EmptyState
          icon={<MessageSquare className="h-16 w-16" />}
          title={q ? `No results for "${search}"` : t('community.noPosts')}
        />
      )}

      {/* Combined feed */}
      <div className="space-y-4">
        {items.map((item) => item.kind === 'post'
          ? <PostCard key={`p-${item.data.id}`} post={item.data} navigate={navigate} onClick={() => navigate(`/kisan/post/${item.data.id}`)} onDelete={handleDeletePost} />
          : <ListingCard key={`l-${item.data.id}`} listing={item.data} navigate={navigate} onClick={() => navigate(`/kisan/listing/${item.data.id}`)} />)}
      </div>

      {hasMore && items.length > 0 && (
        <div className="flex justify-center pt-2">
          <Button
            variant="secondary"
            size="sm"
            loading={loading}
            onClick={() => { const next = page + 1; setPage(next); load(next, true); }}
          >
            {t('kisan.loadMore')}
          </Button>
        </div>
      )}
    </div>
  );
}

function PostCard({
  post, onClick, onDelete, navigate,
}: {
  post: CommunityPostResponseDto;
  onClick: () => void;
  onDelete: (id: string) => void;
  navigate: (to: string) => void;
}) {
  const [showMsgDialog, setShowMsgDialog] = useState(false);
  const [isLiked, setIsLiked] = useState(post.isLikedByCurrentUser);
  const [likeCount, setLikeCount] = useState(post.likeCount);
  const [likeLoading, setLikeLoading] = useState(false);
  const [showComments, setShowComments] = useState(false);
  const [comments, setComments] = useState<CommunityCommentResponseDto[]>([]);
  const [commentsLoading, setCommentsLoading] = useState(false);
  const [newComment, setNewComment] = useState('');
  const [postingComment, setPostingComment] = useState(false);
  const [commentError, setCommentError] = useState(false);

  const authorLocation = mockLocationFrom(post?.authorName ?? '');
  const commentSectionRef = useRef<HTMLDivElement>(null);
  const [commentSectionHeight, setCommentSectionHeight] = useState(0);
  const { user } = useAuth();
  const userName = user?.fullName ?? 'You';
  const userInitial = (userName.charAt(0) ?? 'Y').toUpperCase();

  const handleLike = async (e: React.MouseEvent) => {
    e.stopPropagation();
    if (likeLoading) return;
    setLikeLoading(true);

    // Optimistic update
    const wasLiked = isLiked;
    setIsLiked(!wasLiked);
    setLikeCount(prev => wasLiked ? prev - 1 : prev + 1);

    try {
      const result = await communityApi.likePost(post.id);
      // Sync with server response
      setIsLiked(result.isLiked);
      setLikeCount(result.likeCount);
    } catch {
      // Revert on error
      setIsLiked(wasLiked);
      setLikeCount(wasLiked ? likeCount : likeCount - 1);
    } finally {
      setLikeLoading(false);
    }
  };

  const toggleComments = async (e: React.MouseEvent) => {
    e.stopPropagation();
    e.nativeEvent.stopImmediatePropagation();
    const postId = post?.id;
    if (!postId) return;

    if (!showComments) {
      // Opening comments
      setShowComments(true);
      if (comments.length === 0 && !commentsLoading) {
        setCommentsLoading(true);
        setCommentError(false);
        try {
          const data = await communityApi.getComments(postId, 1, 50);
          // Handle both plain array and paged { items: [...] } responses
          if (Array.isArray(data)) {
            setComments(data);
          } else if (data && Array.isArray((data as any).items)) {
            setComments((data as any).items);
          } else {
            setComments([]);
          }
        } catch {
          setCommentError(true);
          setComments([]);
        } finally {
          setCommentsLoading(false);
        }
      }
    } else {
      // Closing comments — animate then hide
      setCommentSectionHeight(0);
      setTimeout(() => setShowComments(false), 300);
    }
  };

  const handlePostComment = async () => {
    if (!newComment.trim() || postingComment) return;
    setPostingComment(true);
    try {
      const created = await communityApi.createComment(post?.id ?? '', newComment.trim());
      if (created && created.id) {
        setComments((prev) => [...prev, created]);
      } else {
        // Optimistic fallback if API returns empty
        const optimistic: CommunityCommentResponseDto = {
          id: `local-${Date.now()}`,
          authorId: user?.id ?? '',
          authorName: userName,
          content: newComment.trim(),
          createdAt: new Date().toISOString(),
          isOwnedByCurrentUser: true,
        };
        setComments((prev) => [...prev, optimistic]);
      }
      setNewComment('');
      setCommentError(false);
      // Re-measure height for accordion
      requestAnimationFrame(() => {
        if (commentSectionRef.current) {
          setCommentSectionHeight(commentSectionRef.current.scrollHeight);
        }
      });
    } catch {
      // silently ignore
    } finally {
      setPostingComment(false);
    }
  };

  // Measure content height for smooth accordion animation
  useEffect(() => {
    if (showComments && commentSectionRef.current) {
      const measure = () => {
        if (commentSectionRef.current) {
          setCommentSectionHeight(commentSectionRef.current.scrollHeight);
        }
      };
      // Measure immediately and again after any async updates
      requestAnimationFrame(measure);
      const timer = setTimeout(measure, 350);
      return () => clearTimeout(timer);
    }
  }, [showComments, comments.length, commentsLoading]);

  return (
    <>
    <div
      onClick={(e) => {
        // Only navigate if the click is on the card itself (not on buttons inside)
        if (e.target === e.currentTarget || (e.target as HTMLElement).closest('[data-post-body]')) {
          onClick();
        }
      }}
      className="bg-white border border-slate-200 rounded-xl shadow-sm p-3 sm:p-5 cursor-pointer hover:shadow-md hover:border-slate-300 transition-all duration-200"
    >
      {/* Author header */}
      <div data-post-body className="flex items-start justify-between mb-3">
        <div className="flex items-center gap-2.5">
          <div className="h-9 w-9 rounded-full bg-gradient-to-br from-primary-100 to-primary-200 flex items-center justify-center ring-2 ring-primary-50">
            <span className="text-sm font-bold text-primary-700">{(post?.authorName?.charAt(0) ?? '?').toUpperCase()}</span>
          </div>
          <div>
            <p className="text-sm font-semibold text-gray-900">{post?.authorName ?? 'Unknown'}</p>
            <div className="flex items-center gap-2 text-[11px] text-gray-400">
              <span>{formatDate(post.createdAt)}</span>
              <span className="inline-flex items-center gap-0.5 text-indigo-500/70">
                <MapPin className="h-2.5 w-2.5" />{authorLocation}
              </span>
            </div>
          </div>
        </div>
        <div className="flex items-center gap-1.5">
          <Badge variant="neutral" size="sm">{t('kisan.post')}</Badge>
          {!post.isOwnedByCurrentUser && (
            <button
              onClick={(e) => { e.stopPropagation(); setShowMsgDialog(true); }}
              className="p-1.5 rounded-lg text-gray-400 hover:text-primary-600 hover:bg-primary-50 transition-colors"
              title={t('kisan.message')}
            >
              <Mail className="h-3.5 w-3.5" />
            </button>
          )}
          {post.isOwnedByCurrentUser && (
            <button
              onClick={(e) => { e.stopPropagation(); onDelete(post.id); }}
              className="p-1.5 rounded-lg text-gray-400 hover:text-red-500 hover:bg-red-50 transition-colors"
            >
              <Trash2 className="h-3.5 w-3.5" />
            </button>
          )}
        </div>
      </div>

      {/* Post content — dir="auto" lets the browser detect direction from the
          first strong character; unicode-bidi: isolate (via bidi-auto) prevents
          inline English words from flipping the whole Urdu sentence. */}
      <p
        dir="auto"
        data-post-body
        className={cn(
          'text-sm text-gray-700 whitespace-pre-wrap mb-3 leading-relaxed break-words bidi-auto pr-12 sm:pr-0',
          containsUrduScript(post.content)
            ? 'dir-rtl text-right font-urdu leading-loose pl-12 sm:pl-0'
            : isRtl() && 'text-right',
        )}
      >{post.content}</p>

      {/* Post image */}
      {post.imageUrl && (
        <img
          data-post-body
          src={post.imageUrl}
          alt={t('kisan.postAttachment')}
          className="w-full max-h-64 object-cover rounded-lg mb-4 border border-gray-100"
          onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }}
        />
      )}

      {/* Interaction bar */}
      <div className="flex flex-wrap items-center gap-2 sm:gap-4 pt-3 mt-1 border-t border-slate-100">
        <button
          type="button"
          onClick={handleLike}
          disabled={likeLoading}
          className={`flex items-center gap-1 sm:gap-1.5 px-2 sm:px-3 py-1 sm:py-1.5 rounded-lg text-[11px] sm:text-xs font-medium transition-colors ${
            isLiked
              ? 'text-rose-600 bg-rose-50 hover:bg-rose-100'
              : 'text-gray-500 hover:text-rose-600 hover:bg-rose-50'
          }`}
        >
          <Heart className={`h-3.5 w-3.5 sm:h-4 sm:w-4 ${isLiked ? 'fill-current' : ''}`} />
          <span>{likeCount > 0 ? `${likeCount} ` : ''}{t('kisan.like')}</span>
        </button>
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            e.nativeEvent.stopImmediatePropagation();
            toggleComments(e);
          }}
          className={cn(
            'flex items-center gap-1 sm:gap-1.5 px-2 sm:px-3 py-1 sm:py-1.5 rounded-lg text-[11px] sm:text-xs font-medium transition-colors',
            showComments
              ? 'text-primary-600 bg-primary-50'
              : 'text-gray-500 hover:text-primary-600 hover:bg-primary-50',
          )}
        >
          <MessageSquare className="h-3.5 w-3.5 sm:h-4 sm:w-4" />
          <span>{post.commentCount} {t('kisan.comment')}</span>
          <ChevronDown className={cn('h-3 w-3 transition-transform', showComments && 'rotate-180')} />
        </button>
        {!post.isOwnedByCurrentUser && (
          <button
            type="button"
            onClick={(e) => { e.stopPropagation(); setShowMsgDialog(true); }}
            className="flex items-center gap-1 sm:gap-1.5 px-2 sm:px-3 py-1 sm:py-1.5 rounded-lg text-[11px] sm:text-xs font-medium text-gray-500 hover:text-violet-600 hover:bg-violet-50 transition-colors"
          >
            <Mail className="h-3.5 w-3.5 sm:h-4 sm:w-4" />
            <span>{t('kisan.message')}</span>
          </button>
        )}
      </div>

      {/* ── Inline Comment Section (smooth accordion) ──────────────── */}
      {showComments && (
        <div
          ref={commentSectionRef}
          onClick={(e) => { e.stopPropagation(); e.nativeEvent.stopImmediatePropagation(); }}
          className="overflow-hidden transition-[max-height,opacity] duration-300 ease-in-out"
          style={{
            maxHeight: commentSectionHeight === 0 && showComments ? 600 : commentSectionHeight,
            opacity: commentSectionHeight > 0 ? 1 : 0,
          }}
        >
          <div className="mt-3 pt-3 border-t border-slate-100">
          {/* Comment list */}
          {commentsLoading ? (
            <div className="flex items-center justify-center py-4">
              <div className="h-5 w-5 border-2 border-gray-200 border-t-primary-500 rounded-full animate-spin" />
            </div>
          ) : commentError ? (
            <div className="text-center py-3">
              <p className="text-xs text-gray-400">{t('kisan.loadCommentsError')}</p>
              <button
                onClick={(e) => { e.stopPropagation(); toggleComments(e); }}
                className="text-xs text-primary-600 hover:text-primary-700 font-medium mt-1"
              >{t('common.retry')}</button>
            </div>
          ) : (comments || []).length === 0 ? (
            <p className="text-xs text-gray-400 text-center py-3">{t('kisan.noComments')}</p>
          ) : (
            <div className="space-y-2.5 mb-3 max-h-60 overflow-y-auto">
              {(comments || []).map((c) => (
                <div key={c?.id ?? Math.random()} className="flex gap-2">
                  <div className="h-7 w-7 rounded-full bg-gray-100 flex items-center justify-center shrink-0">
                    <span className="text-[10px] font-bold text-gray-500">{(c?.authorName?.charAt(0) ?? '?').toUpperCase()}</span>
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-baseline gap-2">
                      <span className="text-xs font-semibold text-gray-800">{c?.authorName ?? 'Anonymous'}</span>
                      <span className="text-[10px] text-gray-400">{c?.createdAt ? formatDate(c.createdAt) : ''}</span>
                    </div>
                    <p dir="auto" className="text-xs text-gray-600 mt-0.5 break-words bidi-auto">{c?.content ?? ''}</p>
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* Comment input */}
          <div className="flex items-center gap-2">
            <div className="h-7 w-7 rounded-full bg-gradient-to-br from-primary-100 to-primary-200 flex items-center justify-center shrink-0">
              <span className="text-[10px] font-bold text-primary-700">{userInitial}</span>
            </div>
            <div className="flex-1 flex items-center gap-1.5 bg-gray-50 rounded-xl px-3 py-1.5 border border-gray-200 focus-within:ring-2 focus-within:ring-primary-500 focus-within:border-transparent">
              <input
                type="text"
                value={newComment}
                onChange={(e) => setNewComment(e.target.value)}
                placeholder={t('kisan.writeReply')}
                maxLength={500}
                className="flex-1 bg-transparent text-xs text-gray-800 placeholder:text-gray-400 focus:outline-none"
                onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handlePostComment(); } }}
                onClick={(e) => e.stopPropagation()}
              />
              <button
                type="button"
                onClick={(e) => { e.stopPropagation(); handlePostComment(); }}
                disabled={!newComment.trim() || postingComment}
                className="p-1 rounded-md text-primary-600 hover:bg-primary-50 disabled:text-gray-300 disabled:hover:bg-transparent transition-colors"
              >
                {postingComment
                  ? <div className="h-3.5 w-3.5 border-2 border-primary-200 border-t-primary-600 rounded-full animate-spin" />
                  : <Send className="h-3.5 w-3.5" />}
              </button>
            </div>
          </div>
          </div>
        </div>
      )}
    </div>
    {showMsgDialog && (
      <MessageUserDialog
        targetUserId={post?.authorId ?? ''}
        targetUserName={post?.authorName ?? 'Unknown'}
        onClose={() => setShowMsgDialog(false)}
        onCreated={(conversationId) => { setShowMsgDialog(false); navigate(`/kisan/conversation/${conversationId}`); }}
        onFallback={() => { setShowMsgDialog(false); navigate('/kisan?tab=messages'); }}
      />
    )}
    </>
  );
}

function ListingCard({ listing, onClick, navigate }: { listing: MarketplaceListingSummaryDto; onClick: () => void; navigate: (to: string) => void }) {
  const [showContact, setShowContact] = useState(false);

  return (
    <>
    <div
      onClick={onClick}
      className="bg-white border-l-4 border-l-emerald-500 border-t border-r border-b border-t-slate-200 border-r-slate-200 border-b-slate-200 rounded-xl shadow-sm hover:shadow-md hover:border-t-slate-300 hover:border-r-slate-300 hover:border-b-slate-300 transition-all duration-200 overflow-hidden cursor-pointer"
    >
      <div className="flex flex-col sm:flex-row items-start gap-3 sm:gap-4 p-3 sm:p-4">
        {/* Image */}
        {listing.imageUrl ? (
          <img
            src={listing.imageUrl}
            alt={listing.title}
            className="w-20 h-20 sm:w-28 sm:h-24 rounded-xl object-cover shrink-0 border border-gray-100 shadow-sm self-start sm:self-auto"
            onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }}
          />
        ) : (
          <div className="w-20 h-20 sm:w-28 sm:h-24 rounded-xl bg-gradient-to-br from-emerald-50 to-green-50 flex items-center justify-center shrink-0 border border-emerald-100 self-start sm:self-auto">
            <Package className="h-6 w-6 sm:h-8 sm:w-8 text-emerald-300" />
          </div>
        )}

        {/* Content */}
        <div className="flex-1 min-w-0">
          {/* Header: Seller + Listing badge */}
          <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-1.5 sm:gap-2 mb-1.5">
            <div className="flex items-center gap-2 min-w-0">
              <div className="h-7 w-7 rounded-full bg-emerald-100 flex items-center justify-center shrink-0">
                <span className="text-[10px] font-bold text-emerald-700">{(listing?.sellerName?.charAt(0) ?? '?').toUpperCase()}</span>
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-xs font-semibold text-gray-800 truncate">{listing.sellerName}</p>
                <div className="flex items-center gap-1.5 sm:gap-2 text-[10px] text-gray-400 flex-wrap">
                  <span className="inline-flex items-center gap-0.5 text-orange-500/80 shrink-0"><MapPin className="h-2.5 w-2.5" />{listing.location}</span>
                  <span>·</span>
                  <span className="shrink-0">{formatDate(listing.createdAt)}</span>
                </div>
              </div>
            </div>
            <span className="shrink-0 self-start sm:self-auto inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider bg-amber-50 text-amber-700 ring-1 ring-amber-200">
              <Store className="h-2.5 w-2.5" /> Listing
            </span>
          </div>

          {/* Title + Price tag badge */}
          <div className="flex items-start flex-wrap gap-2 mb-1">
            <h3 className={cn(
              'font-semibold text-sm text-gray-900 line-clamp-2 flex-1 min-w-0',
              isRtl() && 'dir-rtl text-right font-urdu',
            )}>{listing.title}</h3>
            <span className="shrink-0 inline-flex items-center gap-1 px-2.5 py-0.5 rounded-lg text-xs font-extrabold bg-emerald-50 text-emerald-700 ring-1 ring-emerald-200">
              PKR {listing.price.toLocaleString('en-PK')}<span className="text-[9px] font-medium text-emerald-500">/{listing.priceUnit}</span>
            </span>
          </div>

          {/* Category + condition */}
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-gray-500">
            <span className={cn(
              'inline-flex items-center gap-1',
              isRtl() && 'dir-rtl text-right font-urdu',
            )}><Tag className="h-3 w-3" />{listing.category}</span>
            <span className={cn(
              'inline-flex items-center gap-1',
              isRtl() && 'dir-rtl text-right font-urdu',
            )}><Package className="h-3 w-3" />{listing.condition}</span>
            <span className={cn(
              'shrink-0 inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-semibold',
              listing.listingType === 'Sale'
                ? 'bg-emerald-50 text-emerald-700'
                : 'bg-blue-50 text-blue-700',
            )}>
              {listing.listingType}
            </span>
          </div>
        </div>
      </div>

      {/* Footer with Message Seller CTA */}
      <div className="flex flex-wrap items-center justify-between sm:justify-end gap-2 px-3 sm:px-4 py-2.5 bg-gray-50/80 border-t border-gray-100 mb-safe">
        {!listing.isOwnedByCurrentUser ? (
          <button
            onClick={(e) => { e.stopPropagation(); setShowContact(true); }}
            className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg text-xs font-bold text-white bg-gradient-to-r from-primary-600 to-indigo-600 hover:from-primary-700 hover:to-indigo-700 shadow-sm hover:shadow transition-all"
          >
            <MessageSquare className="h-3.5 w-3.5" /> {t('marketplace.messageSeller')}
          </button>
        ) : (
          <Badge variant="neutral" size="sm">{t('kisan.listing')}</Badge>
        )}
      </div>
    </div>
    {showContact && (
      <MessageUserDialog
        targetUserId=""
        targetUserName={listing?.sellerName ?? 'Unknown'}
        isListingContact
        listingId={listing?.id}
        listingTitle={listing?.title}
        onClose={() => setShowContact(false)}
        onCreated={(conversationId) => { setShowContact(false); navigate(`/kisan/conversation/${conversationId}`); }}
        onFallback={() => { setShowContact(false); navigate('/kisan?tab=messages'); }}
      />
    )}
    </>
  );
}

/** Listings-only view with search + type/condition filters (full marketplace feed). */
function ListingsView({ navigate }: { navigate: (to: string) => void }) {
  const [apiResult, setApiResult] = useState<MarketplacePagedResultDto | null>(null);
  const [localListings, setLocalListings] = useState<MarketplaceListingSummaryDto[]>(getUserListings);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [listingType, setListingType] = useState('');
  const [condition, setCondition] = useState('');
  const [page, setPage] = useState(1);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await marketplaceApi.getListings({
        page, pageSize: 20,
        ...(search.trim() ? { search: search.trim() } : {}),
        ...(listingType ? { listingType } : {}),
        ...(condition ? { condition } : {}),
      });
      setApiResult(data);
    } catch (err) {
      setError(parseApiError(err).message);
    } finally {
      setLoading(false);
    }
  }, [search, listingType, condition, page]);

  useEffect(() => { load(); }, [load]);

  // Refresh user listings when the modal dispatches the update event
  useEffect(() => {
    const handler = () => setLocalListings(getUserListings());
    window.addEventListener('sabz:listings:updated', handler);
    return () => window.removeEventListener('sabz:listings:updated', handler);
  }, []);

  // Merge API results + dummy listings + locally added listings
  const allListings = [
    ...localListings,
    ...(apiResult?.items ?? []),
    ...DUMMY_LISTINGS,
  ];
  // Deduplicate by id
  const seen = new Set<string>();
  const mergedListings = allListings.filter((l) => {
    if (seen.has(l.id)) return false;
    seen.add(l.id);
    return true;
  });

  if (loading && !apiResult) return <PageSkeleton />;
  if (error && !apiResult) return <ErrorState message={error} onRetry={load} />;

  return (
    <div className="space-y-4">
      {/* Filters */}
      <Card padding="sm">
        <div className="flex flex-wrap items-end gap-3">
          <div className="flex-1 min-w-[120px] sm:min-w-[180px]">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
              <input
                type="text"
                value={search}
                onChange={(e) => { setSearch(e.target.value); setPage(1); }}
                placeholder={t('marketplace.search')}
                className="w-full pl-9 pr-3 py-2 rounded-lg border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-primary-500"
              />
            </div>
          </div>
          <select
            value={listingType}
            onChange={(e) => { setListingType(e.target.value); setPage(1); }}
            className="w-28 px-3 py-2 rounded-lg border border-gray-200 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-primary-500"
          >
            <option value="">{t('marketplace.allTypes')}</option>
            <option value="Sale">{t('marketplace.sale')}</option>
            <option value="Rent">{t('marketplace.rent')}</option>
          </select>
          <select
            value={condition}
            onChange={(e) => { setCondition(e.target.value); setPage(1); }}
            className="w-28 px-3 py-2 rounded-lg border border-gray-200 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-primary-500"
          >
            <option value="">{t('marketplace.allConditions')}</option>
            <option value="New">{t('marketplace.new')}</option>
            <option value="Used">{t('marketplace.used')}</option>
          </select>
        </div>
      </Card>

      {mergedListings.length === 0 ? (
        <EmptyState icon={<Store className="h-16 w-16" />} title={t('marketplace.noListings')} />
      ) : (
        <div className="space-y-3">
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
            {mergedListings.map((listing) => (
              <MarketplaceCard key={listing.id} listing={listing} navigate={navigate} onClick={() => navigate(`/kisan/listing/${listing.id}`)} />
            ))}
          </div>

          {apiResult && apiResult.totalPages > 1 && (
            <div className="flex justify-center gap-2 pt-4">
              <Button variant="secondary" size="sm" disabled={page <= 1} onClick={() => setPage((p) => Math.max(1, p - 1))}>
                Previous
              </Button>
              <span className="flex items-center text-xs text-gray-500">{apiResult.page} / {apiResult.totalPages}</span>
              <Button variant="secondary" size="sm" disabled={page >= apiResult.totalPages} onClick={() => setPage((p) => p + 1)}>
                Next
              </Button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function MarketplaceCard({ listing, onClick, navigate }: { listing: MarketplaceListingSummaryDto; onClick: () => void; navigate: (to: string) => void }) {
  const [showContact, setShowContact] = useState(false);

  return (
    <>
    <div
      onClick={onClick}
      className="bg-white rounded-xl border border-slate-200 shadow-sm hover:shadow-md transition-all duration-200 overflow-hidden cursor-pointer group"
    >
      {/* Image thumbnail */}
      <div className="relative">
        {listing.imageUrl ? (
          <img
            src={listing.imageUrl}
            alt={listing.title}
            className="w-full h-40 object-cover"
            onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }}
          />
        ) : (
          <div className="w-full h-40 bg-gradient-to-br from-emerald-50 via-green-50 to-teal-50 flex items-center justify-center">
            <Package className="h-12 w-12 text-emerald-200" />
          </div>
        )}
        {/* Price tag overlay */}
        <div className="absolute top-3 left-3">
          <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-extrabold bg-emerald-500 text-white shadow-lg shadow-emerald-500/30">
            PKR {listing.price.toLocaleString('en-PK')}<span className="text-[9px] font-medium text-emerald-100">/{listing.priceUnit}</span>
          </span>
        </div>
        {/* Condition badge */}
        <div className="absolute top-3 right-3">
          <span className={cn(
            'inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider ring-1',
            listing.condition === 'New'
              ? 'bg-blue-50 text-blue-700 ring-blue-200'
              : listing.condition === 'Used'
                ? 'bg-amber-50 text-amber-700 ring-amber-200'
                : 'bg-gray-50 text-gray-700 ring-gray-200',
          )}>
            {listing.condition}
          </span>
        </div>
      </div>

      {/* Content */}
      <div className="p-4">
        {/* Title + Listing badge */}
        <div className="flex items-start justify-between gap-2 mb-2">
          <h3 className={cn(
            'font-semibold text-gray-900 text-sm line-clamp-1 flex-1',
            isRtl() && 'dir-rtl text-right font-urdu',
          )}>{listing.title}</h3>
          <span className="shrink-0 inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded-full text-[9px] font-bold uppercase tracking-wider bg-amber-50 text-amber-700 ring-1 ring-amber-200">
            <Store className="h-2.5 w-2.5" /> Listing
          </span>
        </div>

        {/* Category + Location */}
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5 text-[11px] text-gray-500 mb-3">
          <span className={cn(
            'inline-flex items-center gap-1',
            isRtl() && 'dir-rtl text-right font-urdu',
          )}><Tag className="h-3 w-3 text-gray-400" />{listing.category}</span>
          <span className={cn(
            'inline-flex items-center gap-1 text-orange-500/80',
            isRtl() && 'dir-rtl text-right font-urdu',
          )}><MapPin className="h-3 w-3" />{listing.location}</span>
        </div>

        {/* Seller + Date */}
        <div className="flex items-center justify-between pt-2.5 border-t border-gray-100 mb-3">
          <div className="flex items-center gap-1.5">
            <div className="h-5 w-5 rounded-full bg-emerald-100 flex items-center justify-center">
              <span className="text-[8px] font-bold text-emerald-700">{listing.sellerName.charAt(0).toUpperCase()}</span>
            </div>
            <span className={cn(
              'text-[10px] text-gray-500 font-medium',
              isRtl() && 'dir-rtl text-right font-urdu',
            )}>{listing.sellerName}</span>
          </div>
          <span className="text-[10px] text-gray-400">{formatDate(listing.createdAt)}</span>
        </div>

        {/* Message Seller CTA */}
        {!listing.isOwnedByCurrentUser ? (
          <button
            onClick={(e) => { e.stopPropagation(); setShowContact(true); }}
            className="w-full flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg text-xs font-bold text-white bg-gradient-to-r from-primary-600 to-indigo-600 hover:from-primary-700 hover:to-indigo-700 shadow-sm hover:shadow transition-all"
          >
            <MessageSquare className="h-3.5 w-3.5" /> Message Seller
          </button>
        ) : (
          <div className="flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg text-xs font-medium text-gray-500 bg-gray-50 border border-gray-200">
            <Check className="h-3 w-3" /> Your listing
          </div>
        )}
      </div>
    </div>
    {showContact && (
      <MessageUserDialog
        targetUserId=""
        targetUserName={listing?.sellerName ?? 'Unknown'}
        isListingContact
        listingId={listing?.id}
        listingTitle={listing?.title}
        onClose={() => setShowContact(false)}
        onCreated={(conversationId) => { setShowContact(false); navigate(`/kisan/conversation/${conversationId}`); }}
        onFallback={() => { setShowContact(false); navigate('/kisan?tab=messages'); }}
      />
    )}
    </>
  );
}

// ---------------------------------------------------------------------
//  Sell Item Modal
// ---------------------------------------------------------------------

const LISTING_CATEGORIES = [
  'Tractors & Machinery', 'Implements', 'Seeds & Fertilizer',
  'Livestock & Feed', 'Solar Systems', 'Pesticides & Sprayers',
  'Harvesting Equipment', 'Irrigation', 'Tools & Supplies', 'Other',
];

function SellItemModal({ onClose }: { onClose: () => void }) {
  const { user } = useAuth();
  const [title, setTitle] = useState('');
  const [category, setCategory] = useState(LISTING_CATEGORIES[0]);
  const [price, setPrice] = useState('');
  const [condition, setCondition] = useState('New');
  const [listingType, setListingType] = useState('Sale');
  const [location, setLocation] = useState('');
  const [imageUrl, setImageUrl] = useState('');
  const [description, setDescription] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const canSubmit = title.trim() && price && location.trim() && description.trim();

  const handleSubmit = () => {
    if (!canSubmit || submitting) return;
    setSubmitting(true);

    const newListing: MarketplaceListingSummaryDto = {
      id: `user-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      title: title.trim(),
      category,
      listingType,
      description: description.trim(),
      price: Number(price),
      priceUnit: 'unit',
      location: location.trim(),
      condition,
      availability: 'Available',
      imageUrl: imageUrl.trim() || null,
      createdAt: new Date().toISOString(),
      sellerName: user?.fullName ?? 'You',
      isOwnedByCurrentUser: true,
    };

    // Persist to localStorage so both feed & listings views pick it up
    addUserListing(newListing);

    // Give the parent a moment then close
    setTimeout(() => {
      setSubmitting(false);
      onClose();
      // Reload the page data so the new listing appears
      window.dispatchEvent(new Event('sabz:listings:updated'));
    }, 300);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={onClose} />

      {/* Modal */}
      <div className="relative w-full max-w-lg bg-white rounded-2xl shadow-2xl overflow-hidden animate-in fade-in zoom-in-95 duration-200">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100 bg-gradient-to-r from-emerald-50 to-green-50">
          <div className="flex items-center gap-2">
            <div className="h-8 w-8 rounded-lg bg-gradient-to-br from-emerald-500 to-green-600 flex items-center justify-center">
              <Store className="h-4 w-4 text-white" />
            </div>
            <h2 className="text-base font-bold text-gray-900">{t('kisan.sellItem')}</h2>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-lg text-gray-400 hover:text-gray-600 hover:bg-white/80 transition-colors">
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Form */}
        <div className="px-6 py-4 space-y-4 max-h-[65vh] overflow-y-auto">
          {/* Title */}
          <div>
            <label className="block text-xs font-semibold text-gray-700 mb-1">{t('kisan.itemTitle')}</label>
            <input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder={t('kisan.itemTitlePlaceholder')}
              maxLength={200}
              className="w-full px-3 py-2 rounded-lg border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-transparent"
            />
          </div>

          {/* Category + Condition */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold text-gray-700 mb-1">{t('calculator.category')}</label>
              <select
                value={category}
                onChange={(e) => setCategory(e.target.value)}
                className="w-full px-3 py-2 rounded-lg border border-gray-200 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-emerald-500"
              >
                {LISTING_CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-xs font-semibold text-gray-700 mb-1">{t('kisan.condition')}</label>
              <select
                value={condition}
                onChange={(e) => setCondition(e.target.value)}
                className="w-full px-3 py-2 rounded-lg border border-gray-200 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-emerald-500"
              >
                <option value="New">{t('kisan.new')}</option>
                <option value="Used">{t('kisan.used')}</option>
              </select>
            </div>
          </div>

          {/* Price + Type */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold text-gray-700 mb-1">{t('kisan.pricePkr')}</label>
              <input
                type="number"
                value={price}
                onChange={(e) => setPrice(e.target.value)}
                placeholder="e.g., 1450000"
                min={0}
                className="w-full px-3 py-2 rounded-lg border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-transparent"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-gray-700 mb-1">{t('kisan.type')}</label>
              <select
                value={listingType}
                onChange={(e) => setListingType(e.target.value)}
                className="w-full px-3 py-2 rounded-lg border border-gray-200 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-emerald-500"
              >
                <option value="Sale">{t('kisan.sale')}</option>
                <option value="Rent">{t('kisan.rent')}</option>
              </select>
            </div>
          </div>

          {/* Location */}
          <div>
            <label className="block text-xs font-semibold text-gray-700 mb-1">{t('kisan.locationLabel')}</label>
            <div className="relative">
              <MapPin className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
              <input
                value={location}
                onChange={(e) => setLocation(e.target.value)}
                placeholder="e.g., Faisalabad"
                maxLength={100}
                className="w-full pl-9 pr-3 py-2 rounded-lg border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-transparent"
              />
            </div>
          </div>

          {/* Photo URL */}
          <div>
            <label className="block text-xs font-semibold text-gray-700 mb-1">{t('kisan.photoUrl')}</label>
            <div className="relative">
              <Camera className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
              <input
                value={imageUrl}
                onChange={(e) => setImageUrl(e.target.value)}
                placeholder={t('kisan.pasteImageUrl')}
                maxLength={2048}
                className="w-full pl-9 pr-3 py-2 rounded-lg border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-transparent"
              />
            </div>
          </div>

          {/* Description */}
          <div>
            <label className="block text-xs font-semibold text-gray-700 mb-1">{t('marketplace.listingForm.description')}</label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder={t('kisan.descriptionPlaceholder')}
              maxLength={2000}
              rows={3}
              className="w-full px-3 py-2 rounded-lg border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-transparent resize-none"
            />
          </div>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end gap-2 px-6 py-4 border-t border-gray-100 bg-gray-50/50">
          <button
            onClick={onClose}
            className="px-4 py-2 rounded-lg text-xs font-medium text-gray-600 hover:bg-gray-100 transition-colors"
          >
            {t('common.cancel')}
          </button>
          <button
            onClick={handleSubmit}
            disabled={!canSubmit || submitting}
            className="inline-flex items-center gap-1.5 px-5 py-2 rounded-lg text-xs font-bold text-white bg-gradient-to-r from-emerald-600 to-green-600 hover:from-emerald-700 hover:to-green-700 shadow-sm shadow-emerald-500/20 disabled:opacity-50 disabled:cursor-not-allowed transition-all"
          >
            {submitting
              ? <><div className="h-3 w-3 border-2 border-white/30 border-t-white rounded-full animate-spin" /> {t('kisan.publishing')}</>
              : <><Upload className="h-3 w-3" /> {t('kisan.publishListing')}</>}
          </button>
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------
//  Messages tab
// ---------------------------------------------------------------------

function MessagesTab({ navigate }: { navigate: (to: string) => void }) {
  const [result, setResult] = useState<MarketplaceInboxPagedResultDto | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [page, setPage] = useState(1);
  const [localConvs, setLocalConvs] = useState(getLocalConversations);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setResult(await inboxApi.getInbox(page, 20));
    } catch {
      // API unavailable — rely on local conversations only
      setResult({ items: [], page: 1, pageSize: 20, totalCount: 0, totalPages: 0 });
    } finally {
      setLoading(false);
    }
  }, [page]);

  useEffect(() => { load(); }, [load]);

  // Refresh local conversations when new ones are created
  useEffect(() => {
    const handler = () => setLocalConvs(getLocalConversations());
    window.addEventListener('sabz:listings:updated', handler);
    // Also listen for a dedicated conversations-updated event
    window.addEventListener('sabz:conversations:updated', handler);
    return () => {
      window.removeEventListener('sabz:listings:updated', handler);
      window.removeEventListener('sabz:conversations:updated', handler);
    };
  }, []);

  // Map local conversations to the summary DTO shape
  const localConvSummaries: MarketplaceConversationSummaryDto[] = localConvs.map((c) => ({
    conversationId: c.conversationId,
    listingId: c.listingId,
    listingTitle: c.listingTitle,
    otherParticipantName: c.otherParticipantName,
    latestMessagePreview: c.latestMessagePreview,
    latestMessageAt: c.latestMessageAt,
    role: c.role,
  }));

  // Merge: local first, then API (deduplicate by conversationId)
  const apiIds = new Set((result?.items ?? []).map((c) => c.conversationId));
  const uniqueLocalConvs = localConvSummaries.filter((c) => !apiIds.has(c.conversationId));
  const allConversations = [...uniqueLocalConvs, ...(result?.items ?? [])];

  if (loading && !result) return <PageSkeleton />;

  return (
    <div className="space-y-3">
      {allConversations.length === 0 && !loading ? (
        <EmptyState icon={<MessageSquare className="h-16 w-16" />} title={t('inbox.noConversations')} />
      ) : (
        <>
          <div className="space-y-2">
            {allConversations.map((conv) => (
              <ConversationCard key={conv.conversationId} conv={conv} onClick={() => navigate(`/kisan/conversation/${conv.conversationId}`)} />
            ))}
          </div>
          {result && result.totalPages > 1 && (
            <div className="flex justify-center gap-2 pt-4">
              <Button variant="secondary" size="sm" disabled={page <= 1} onClick={() => setPage((p) => Math.max(1, p - 1))}>
                {t('common.previous')}
              </Button>
              <span className="flex items-center text-xs text-gray-500">{result.page} / {result.totalPages}</span>
              <Button variant="secondary" size="sm" disabled={page >= result.totalPages} onClick={() => setPage((p) => p + 1)}>
                {t('common.next')}
              </Button>
            </div>
          )}
        </>
      )}
      {error && <p className="text-center text-xs text-gray-400 pt-2">{t('kisan.serverUnavailable')}</p>}
    </div>
  );
}

function ConversationCard({ conv, onClick }: { conv: MarketplaceConversationSummaryDto; onClick: () => void }) {
  const hasListing = !!conv?.listingId;
  const role = conv?.role ?? '';
  const isMarketplace = hasListing && (role === 'Buyer' || role === 'Seller');

  // Title = other participant name
  const title = conv?.otherParticipantName
    || (hasListing ? (conv?.listingTitle || t('kisan.directConversation') || 'Direct Conversation') : (t('kisan.directConversation') || 'Direct Conversation'));

  // Other participant's role (badge): if current user is Buyer → other is Seller, vice versa
  const otherRole: 'Buyer' | 'Seller' | null = isMarketplace
    ? (role === 'Buyer' ? 'Seller' : 'Buyer')
    : null;

  // Context subtitle
  const subtitleText = isMarketplace && conv?.listingTitle
    ? `${t('kisan.inquiry')} ${conv.listingTitle}`
    : isMarketplace
      ? (otherRole === 'Seller' ? t('kisan.sellerOnKisan') : t('kisan.buyerOnKisan'))
      : '';

  return (
    <Card hover onClick={onClick} padding="sm">
      <div className="flex items-start gap-3">
        <div className="h-10 w-10 rounded-full bg-violet-100 flex items-center justify-center shrink-0">
          {hasListing ? <Store className="h-5 w-5 text-violet-600" /> : <Mail className="h-5 w-5 text-violet-600" />}
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0">
              <h3
                dir="auto"
                className={cn(
                  'font-semibold text-sm text-gray-900 truncate bidi-auto',
                  containsUrduScript(title)
                    ? 'dir-rtl text-right font-urdu'
                    : isRtl() && 'text-right',
                )}
              >{title}</h3>
              <p
                dir="auto"
                className={cn(
                  'text-xs text-gray-500 truncate bidi-auto',
                  containsUrduScript(subtitleText)
                    ? 'dir-rtl text-right font-urdu'
                    : isRtl() && 'text-right',
                )}
              >{subtitleText || (conv?.otherParticipantName ?? '')}</p>
            </div>
            {isMarketplace ? (
              <Badge variant={otherRole === 'Seller' ? 'success' : 'info'} size="sm">
                {otherRole === 'Seller' ? t('inbox.seller') : t('inbox.buyer')}
              </Badge>
            ) : (
              <Badge variant="neutral" size="sm">
                {t('inbox.member')}
              </Badge>
            )}
          </div>
          {conv?.latestMessagePreview && (
            <p
              dir="auto"
              className={cn(
                'text-xs text-gray-500 mt-1 truncate leading-relaxed break-words bidi-auto',
                containsUrduScript(conv.latestMessagePreview ?? '')
                  ? 'dir-rtl text-right font-urdu'
                  : isRtl() && 'text-right',
              )}
            >{conv.latestMessagePreview}</p>
          )}
          {conv?.latestMessageAt && (
            <p className="text-[10px] text-gray-400 mt-1 flex items-center gap-1">
              <Clock className="h-3 w-3" /> {formatDate(conv.latestMessageAt)}
            </p>
          )}
        </div>
      </div>
    </Card>
  );
}

// ---------------------------------------------------------------------
//  Message User Dialog (direct message or contact seller)
// ---------------------------------------------------------------------

/**
 * Modal dialog for starting a conversation.
 * Two modes:
 *  - Direct message: `targetUserId` is provided → calls startDirectConversation
 *  - Contact seller: `listingId` is provided → calls contactSeller
 *
 * Graceful fallback: when the recipient ID is missing (mock / unregistered
 * user) or the API call fails, the message is stored in a local conversation
 * and the user is navigated to the conversation page seamlessly.
 */
function MessageUserDialog({
  targetUserId,
  targetUserName,
  listingId,
  listingTitle,
  isListingContact,
  onClose,
  onCreated,
  onFallback,
}: {
  targetUserId: string;
  targetUserName: string;
  listingId?: string;
  listingTitle?: string;
  isListingContact?: boolean;
  onClose: () => void;
  onCreated: (conversationId: string) => void;
  onFallback: () => void;
}) {
  const { user } = useAuth();
  const buyerName = user?.fullName ?? 'You';

  // Pre-fill message for listing contact
  const defaultMsg = isListingContact && listingTitle
    ? `Hi ${targetUserName ?? 'there'}, I am interested in your listing: ${listingTitle}`
    : '';
  const [message, setMessage] = useState(defaultMsg);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  /**
   * Check for an existing local conversation before hitting the API.
   * If found, reuse it so the user lands in the same thread.
   */
  const existingConv = isListingContact
    ? findLocalConversation(targetUserName ?? 'Unknown', listingId)
    : findLocalConversation(targetUserName ?? 'Unknown');

  const handleSend = async () => {
    if (!message.trim() || sending) return;
    setSending(true);
    setError(null);

    const safeName = targetUserName ?? 'Unknown';

    try {
      // ── 1. Try the backend API ──
      let conversationId: string;
      if (isListingContact && listingId && isValidGuid(listingId)) {
        // Only call API for real (GUID) listing IDs
        const conv = await inboxApi.contactSeller(listingId, message.trim());
        conversationId = conv?.conversationId;
        if (!conversationId) throw new Error('No conversation ID returned');
      } else if (!isListingContact && isValidGuid(targetUserId)) {
        const conv = await inboxApi.startDirectConversation(targetUserId, message.trim());
        conversationId = conv?.conversationId;
        if (!conversationId) throw new Error('No conversation ID returned');
      } else {
        // ── 2. Invalid / missing IDs → local fallback ──
        throw new Error('Invalid recipient');
      }
      onCreated(conversationId);
    } catch {
      // ── 3. Graceful local-state fallback (no error shown to user) ──
      const convId = upsertLocalConversation({
        sellerName: safeName,
        listingId: listingId,
        listingTitle: listingTitle,
        message: message.trim(),
        buyerName,
      });
      // Always navigate to the conversation page (local-aware)
      onCreated(convId);
    } finally {
      setSending(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center">
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={onClose} />

      {/* Dialog */}
      <div className="relative w-full sm:max-w-md bg-white rounded-t-2xl sm:rounded-2xl shadow-xl p-5 animate-slide-up">
        <div className="flex items-center gap-3 mb-4">
          <div className="h-10 w-10 rounded-full bg-gradient-to-br from-violet-100 to-indigo-100 flex items-center justify-center shrink-0">
            <Mail className="h-5 w-5 text-violet-600" />
          </div>
          <div>
            <p className="font-semibold text-gray-900 text-sm">
              {isListingContact ? t('kisan.contactSeller') : t('kisan.message')}
            </p>
            <p className="text-xs text-gray-500">{targetUserName}</p>
          </div>
        </div>

        {error && (
          <div className="mb-3 px-3 py-2 rounded-lg bg-red-50 text-red-600 text-xs">{error}</div>
        )}

        <textarea
          value={message}
          onChange={(e) => setMessage(e.target.value)}
          placeholder={t('inbox.messagePlaceholder')}
          maxLength={2000}
          rows={3}
          autoFocus
          disabled={sending}
          className="w-full px-3 py-2.5 rounded-xl border border-gray-200 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-primary-500 resize-none disabled:opacity-50"
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
              e.preventDefault();
              handleSend();
            }
          }}
        />

        <div className="flex items-center justify-end gap-2 mt-3">
          <Button variant="secondary" size="sm" onClick={onClose} disabled={sending}>
            {t('common.cancel')}
          </Button>
          <Button
            variant="primary"
            size="sm"
            loading={sending}
            disabled={!message.trim()}
            onClick={handleSend}
          >
            <Send className="h-3.5 w-3.5" /> {t('kisan.sendMessage')}
          </Button>
        </div>
      </div>
    </div>
  );
}