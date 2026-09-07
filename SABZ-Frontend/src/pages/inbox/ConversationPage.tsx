import { useEffect, useState, useRef, useCallback } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { inboxApi } from '@/api/inboxApi';
import { parseApiError } from '@/api/client';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Badge } from '@/components/ui/Badge';
import { ErrorState } from '@/components/ui/EmptyState';
import { PageSkeleton } from '@/components/ui/Skeleton';
import { formatDate, cn } from '@/lib/utils';
import { t } from '@/lib/i18n';
import { ArrowLeft, Send, Store, MessageSquare, Mail, Users } from 'lucide-react';
import type { MarketplaceConversationDto, MarketplaceMessageDto } from '@/types';

/* ─── Local conversation helpers (shared with KisanNetworkPage) ──── */

interface LocalConvMessage {
  messageId: string;
  senderName: string;
  content: string;
  createdAt: string;
  isOwnMessage: boolean;
}

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
  messages: LocalConvMessage[];
}

const LOCAL_CONVERSATIONS_KEY = 'sabz_local_conversations';

function getLocalConversation(conversationId: string): LocalConversation | undefined {
  try {
    const convs = JSON.parse(localStorage.getItem(LOCAL_CONVERSATIONS_KEY) || '[]') as LocalConversation[];
    return convs.find((c) => c.conversationId === conversationId);
  } catch { return undefined; }
}

function addLocalMessage(conversationId: string, senderName: string, content: string) {
  try {
    const convs = JSON.parse(localStorage.getItem(LOCAL_CONVERSATIONS_KEY) || '[]') as LocalConversation[];
    const conv = convs.find((c) => c.conversationId === conversationId);
    if (!conv) return;
    const msg: LocalConvMessage = {
      messageId: `local-msg-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      senderName,
      content,
      createdAt: new Date().toISOString(),
      isOwnMessage: true,
    };
    conv.messages.push(msg);
    conv.latestMessagePreview = content;
    conv.latestMessageAt = msg.createdAt;
    localStorage.setItem(LOCAL_CONVERSATIONS_KEY, JSON.stringify(convs));
  } catch { /* silently ignore */ }
}

function isLocalConversationId(id: string | undefined): boolean {
  return !!id && id.startsWith('local-conv-');
}

/** Convert a local conversation to the DTO shape used by the UI. */
function localToDto(conv: LocalConversation): MarketplaceConversationDto {
  return {
    conversationId: conv.conversationId,
    listingId: conv.listingId,
    listingTitle: conv.listingTitle,
    listingType: null,
    listingPrice: 0,
    listingPriceUnit: '',
    buyerName: conv.buyerName,
    sellerName: conv.sellerName,
    currentUserRole: conv.role,
    messages: {
      items: conv.messages,
      page: 1,
      pageSize: 100,
      totalCount: conv.messages.length,
      totalPages: 1,
    },
  };
}

export function ConversationPage() {
  const { conversationId } = useParams<{ conversationId: string }>();
  const navigate = useNavigate();
  const [conversation, setConversation] = useState<MarketplaceConversationDto | null>(null);
  const [messages, setMessages] = useState<MarketplaceMessageDto[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [messageText, setMessageText] = useState('');
  const [sending, setSending] = useState(false);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const scrollRef = useRef<HTMLDivElement>(null);

  const isLocal = isLocalConversationId(conversationId);

  const load = useCallback(async () => {
    if (!conversationId) return;
    setLoading(true);
    setError(null);

    // ── Local conversation path ──
    if (isLocal) {
      const localConv = getLocalConversation(conversationId);
      if (localConv) {
        const dto = localToDto(localConv);
        setConversation(dto);
        setMessages(dto.messages.items);
        setTotalPages(1);
      } else {
        setError('Conversation not found');
      }
      setLoading(false);
      return;
    }

    // ── API path ──
    try {
      const data = await inboxApi.getConversation(conversationId, page, 20);
      setConversation(data);
      setMessages((prev) => page === 1 ? data.messages.items : [...data.messages.items, ...prev]);
      setTotalPages(data.messages.totalPages);
    } catch (err) {
      setError(parseApiError(err).message);
    } finally {
      setLoading(false);
    }
  }, [conversationId, page, isLocal]);

  useEffect(() => { load(); }, [load]);

  useEffect(() => {
    if (scrollRef.current && page === 1) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages, page]);

  const handleSend = async () => {
    if (!conversationId || !messageText.trim()) return;
    setSending(true);

    // ── Local conversation: append directly to localStorage ──
    if (isLocal) {
      const senderName = conversation?.buyerName ?? 'You';
      addLocalMessage(conversationId, senderName, messageText.trim());
      setMessageText('');
      // Reload from localStorage
      const localConv = getLocalConversation(conversationId);
      if (localConv) {
        const dto = localToDto(localConv);
        setConversation(dto);
        setMessages(dto.messages.items);
      }
      if (scrollRef.current) {
        scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
      }
      setSending(false);
      return;
    }

    // ── API path ──
    try {
      await inboxApi.sendMessage(conversationId, messageText.trim());
      setMessageText('');
      const data = await inboxApi.getConversation(conversationId, 1, 20);
      setMessages(data.messages.items);
      setConversation(data);
      if (scrollRef.current) {
        scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
      }
    } catch (err) {
      setError(parseApiError(err).message);
    } finally {
      setSending(false);
    }
  };

  const loadOlder = () => {
    if (page < totalPages) setPage((p) => p + 1);
  };

  if (loading && !conversation) return <PageSkeleton />;
  if (error && !conversation) return <ErrorState message={error} />;
  if (!conversation) return null;

  // ── Determine conversation type & role ──
  const hasListing = !!conversation?.listingId;
  const currentUserRole = conversation?.currentUserRole ?? '';
  const isMarketplace = hasListing && (currentUserRole === 'Buyer' || currentUserRole === 'Seller');

  // The "other" participant (not the current user)
  const otherParticipantName = isMarketplace
    ? (currentUserRole === 'Buyer' ? (conversation?.sellerName ?? '') : (conversation?.buyerName ?? ''))
    : (conversation?.sellerName || conversation?.buyerName || '');

  // The OTHER participant's role (what badge to display)
  // If current user is Buyer → other is Seller; if current user is Seller → other is Buyer
  const otherRole: 'Buyer' | 'Seller' | null = isMarketplace
    ? (currentUserRole === 'Buyer' ? 'Seller' : 'Buyer')
    : null;

  // Subtitle context line
  const subtitleText = isMarketplace && conversation?.listingTitle
    ? `Inquiry: ${conversation.listingTitle}`
    : isMarketplace
      ? (otherRole === 'Seller' ? 'Seller on Kisan Network' : 'Buyer on Kisan Network')
      : '';

  return (
    <div className="flex flex-col h-[calc(100vh-8rem)] animate-fade-in">
      {/* Header */}
      <div className="flex items-center gap-3 pb-4 border-b border-gray-100 mb-4">
        <button
          onClick={() => navigate('/kisan?tab=messages')}
          className="flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-700 transition-colors"
        >
          <ArrowLeft className="h-4 w-4" />
        </button>
        <div className="h-10 w-10 rounded-full bg-violet-100 flex items-center justify-center shrink-0">
          {hasListing
            ? <Store className="h-5 w-5 text-violet-600" />
            : <Mail className="h-5 w-5 text-violet-600" />}
        </div>
        <div className="flex-1 min-w-0">
          <h1 className="font-semibold text-gray-900 truncate">
            {otherParticipantName || (hasListing ? (conversation?.listingTitle ?? '') : '')}
          </h1>
          <div className="flex items-center gap-2 text-xs text-gray-500">
            {isMarketplace ? (
              <>
                <span className="truncate">{subtitleText}</span>
                <Badge variant={otherRole === 'Seller' ? 'success' : 'info'} size="sm">
                  {otherRole === 'Seller' ? t('inbox.seller') : t('inbox.buyer')}
                </Badge>
              </>
            ) : (
              <>
                <span className="flex items-center gap-1">
                  <Users className="h-3 w-3 text-gray-400" />
                  {otherParticipantName || t('inbox.member')}
                </span>
                <Badge variant="neutral" size="sm">
                  {t('inbox.member')}
                </Badge>
              </>
            )}
          </div>
        </div>
        {hasListing && (conversation?.listingPrice ?? 0) > 0 && (
          <div className="text-right">
            <p className="text-lg font-bold text-primary-700">
              PKR {(conversation?.listingPrice ?? 0).toLocaleString('en-PK')}
            </p>
            <p className="text-[10px] text-gray-400">/{conversation?.listingPriceUnit ?? 'unit'}</p>
          </div>
        )}
      </div>

      {/* Messages area */}
      <div ref={scrollRef} className="flex-1 overflow-y-auto space-y-3 px-1">
        {totalPages > 1 && page < totalPages && (
          <div className="text-center">
            <button
              onClick={loadOlder}
              className="text-xs text-primary-600 hover:text-primary-700 font-medium"
            >
              Load older messages
            </button>
          </div>
        )}

        {messages.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full text-gray-400">
            <MessageSquare className="h-12 w-12 mb-3" />
            <p className="text-sm">{t('inbox.noMessages')}</p>
          </div>
        ) : (
          messages.map((msg) => (
            <MessageBubble key={msg.messageId} message={msg} />
          ))
        )}
      </div>

      {/* Message input */}
      <div className="pt-4 border-t border-gray-100 mt-4">
        <div className="flex items-end gap-2">
          <textarea
            value={messageText}
            onChange={(e) => setMessageText(e.target.value)}
            placeholder={t('inbox.messagePlaceholder')}
            maxLength={2000}
            rows={2}
            className="flex-1 px-3 py-2 rounded-xl border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-primary-500 resize-none"
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                handleSend();
              }
            }}
          />
          <Button
            variant="primary"
            size="sm"
            loading={sending}
            disabled={!messageText.trim()}
            onClick={handleSend}
          >
            <Send className="h-4 w-4" />
          </Button>
        </div>
      </div>
    </div>
  );
}

function MessageBubble({ message }: { message: MarketplaceMessageDto }) {
  return (
    <div className={cn('flex', message.isOwnMessage ? 'justify-end' : 'justify-start')}>
      <div className={cn(
        'max-w-[75%] rounded-2xl px-4 py-2.5',
        message.isOwnMessage
          ? 'bg-primary-600 text-white rounded-br-md'
          : 'bg-gray-100 text-gray-900 rounded-bl-md',
      )}>
        {!message.isOwnMessage && (
          <p className="text-[10px] font-medium text-gray-500 mb-0.5">{message.senderName}</p>
        )}
        <p className="text-sm whitespace-pre-wrap">{message.content}</p>
        <p className={cn(
          'text-[10px] mt-1',
          message.isOwnMessage ? 'text-primary-200' : 'text-gray-400',
        )}>
          {formatDate(message.createdAt)}
        </p>
      </div>
    </div>
  );
}
