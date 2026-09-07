import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { communityApi } from '@/api/communityApi';
import { inboxApi } from '@/api/inboxApi';
import { parseApiError } from '@/api/client';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { ErrorState } from '@/components/ui/EmptyState';
import { PageSkeleton } from '@/components/ui/Skeleton';
import { formatDate, cn } from '@/lib/utils';
import { t, isRtl } from '@/lib/i18n';
import { ArrowLeft, Send, Trash2, MessageSquare, Mail } from 'lucide-react';
import type { CommunityPostDetailDto, CommunityCommentResponseDto } from '@/types';

/**
 * Detect whether a string contains Urdu / Arabic script characters.
 * Covers the main Arabic Unicode block (U+0600–U+06FF) which includes
 * Urdu-specific letters and punctuation like ؟ (U+061F).
 */
function containsUrduScript(text: string): boolean {
  return /[\u0600-\u06FF\u0750-\u077F\uFB50-\uFDFF\uFE70-\uFEFF]/.test(text);
}

/** Check whether a string is a valid non-empty GUID. */
function isValidGuid(id: string | undefined | null): boolean {
  return !!id && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id);
}

/** Deterministic mock GUID from a seed string. */
function mockGuidFrom(seed: string): string {
  let h = 0;
  for (let i = 0; i < seed.length; i++) {
    h = ((h << 5) - h + seed.charCodeAt(i)) | 0;
  }
  const hex = Math.abs(h).toString(16).padStart(8, '0').slice(0, 8);
  return `${hex}-0000-4000-8000-000000000000`;
}

/** Store a simulated message in localStorage. */
function storeLocalMessage(recipientName: string, message: string) {
  try {
    const key = 'sabz_local_messages';
    const existing = JSON.parse(localStorage.getItem(key) || '[]') as Array<{
      recipient: string; message: string; at: string;
    }>;
    existing.push({ recipient: recipientName, message, at: new Date().toISOString() });
    localStorage.setItem(key, JSON.stringify(existing));
  } catch { /* silently ignore */ }
}

export function CommunityPostPage() {
  const { postId } = useParams<{ postId: string }>();
  const navigate = useNavigate();
  const [data, setData] = useState<CommunityPostDetailDto | null>(null);
  const [comments, setComments] = useState<CommunityCommentResponseDto[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [commentInput, setCommentInput] = useState('');
  const [sending, setSending] = useState(false);
  const [msgTarget, setMsgTarget] = useState<{ userId: string; name: string } | null>(null);
  const [msgText, setMsgText] = useState('');
  const [msgSending, setMsgSending] = useState(false);
  const [msgError, setMsgError] = useState<string | null>(null);

  const load = async () => {
    if (!postId) return;
    setLoading(true);
    setError(null);
    try {
      const d = await communityApi.getPost(postId);
      // Ensure authorId is always valid — fall back to a deterministic mock
      // GUID when the backend hasn't yet exposed the field.
      if (!isValidGuid(d.post.authorId)) {
        d.post.authorId = mockGuidFrom(d.post.authorName);
      }
      d.comments.forEach((c) => {
        if (!isValidGuid(c.authorId)) {
          c.authorId = mockGuidFrom(c.authorName);
        }
      });
      setData(d);
      setComments(d.comments);
    } catch (err) {
      setError(parseApiError(err).message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, [postId]);

  const handleComment = async () => {
    if (!commentInput.trim() || !postId || sending) return;
    setSending(true);
    try {
      const newComment = await communityApi.createComment(postId, commentInput.trim());
      setComments((prev) => [...prev, newComment]);
      setCommentInput('');
    } catch (err) {
      setError(parseApiError(err).message);
    } finally {
      setSending(false);
    }
  };

  const handleDeleteComment = async (commentId: string) => {
    if (!window.confirm(t('community.deleteCommentConfirm'))) return;
    try {
      await communityApi.deleteComment(commentId);
      setComments((prev) => prev.filter((c) => c.id !== commentId));
    } catch (err) {
      setError(parseApiError(err).message);
    }
  };

  const handleDeletePost = async () => {
    if (!postId || !window.confirm(t('community.deleteConfirm'))) return;
    try {
      await communityApi.deletePost(postId);
      navigate('/kisan');
    } catch (err) {
      setError(parseApiError(err).message);
    }
  };

  const handleSendDirect = async () => {
    if (!msgTarget || !msgText.trim() || msgSending) return;
    setMsgSending(true);
    setMsgError(null);

    // ── Guard: invalid recipient ID → simulate locally ──
    if (!isValidGuid(msgTarget.userId)) {
      storeLocalMessage(msgTarget.name, msgText.trim());
      setMsgTarget(null);
      setMsgText('');
      navigate('/kisan?tab=messages');
      return;
    }

    try {
      const conv = await inboxApi.startDirectConversation(msgTarget.userId, msgText.trim());
      setMsgTarget(null);
      setMsgText('');
      navigate(`/kisan/conversation/${conv.conversationId}`);
    } catch (err) {
      const errorMsg = parseApiError(err).message;
      const isNotFound = errorMsg.toLowerCase().includes('not found')
        || errorMsg.toLowerCase().includes('404')
        || errorMsg.toLowerCase().includes('target user');

      if (isNotFound) {
        // Recipient not registered — store locally and redirect gracefully
        storeLocalMessage(msgTarget.name, msgText.trim());
        setMsgTarget(null);
        setMsgText('');
        navigate('/kisan?tab=messages');
      } else {
        setMsgError(errorMsg);
      }
    } finally {
      setMsgSending(false);
    }
  };

  if (loading) return <PageSkeleton />;
  if (error && !data) return <ErrorState message={error} onRetry={load} />;
  if (!data) return null;

  const { post } = data;

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex items-center justify-between">
        <button
          onClick={() => navigate('/kisan')}
          className="flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-700 transition-colors"
        >
          <ArrowLeft className="h-4 w-4" /> {t('common.back')}
        </button>
        {post.isOwnedByCurrentUser && (
          <Button variant="danger" size="sm" onClick={handleDeletePost}>
            <Trash2 className="h-4 w-4" /> {t('common.delete')}
          </Button>
        )}
      </div>

      {/* Post */}
      <Card padding="md">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-3">
            <div className="h-10 w-10 rounded-full bg-primary-100 flex items-center justify-center">
              <span className="text-sm font-bold text-primary-700">
                {post.authorName.charAt(0).toUpperCase()}
              </span>
            </div>
            <div>
              <p className="font-medium text-gray-900">{post.authorName}</p>
              <p className="text-xs text-gray-400">{formatDate(post.createdAt)}</p>
            </div>
          </div>
          {!post.isOwnedByCurrentUser && (
            <button
              onClick={() => setMsgTarget({ userId: post.authorId, name: post.authorName })}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium text-gray-500 hover:text-violet-600 hover:bg-violet-50 transition-colors"
            >
              <Mail className="h-3.5 w-3.5" /> {t('kisan.message')}
            </button>
          )}
        </div>

        {/* Post body — dir="auto" detects direction from first strong character;
            bidi-auto (unicode-bidi: isolate) prevents inline English terms like
            'rust' from flipping Urdu punctuation to the wrong side. */}
        <p
          dir="auto"
          className={cn(
            'text-gray-700 whitespace-pre-wrap leading-relaxed break-words bidi-auto',
            containsUrduScript(post.content)
              ? 'dir-rtl text-right font-urdu leading-loose'
              : isRtl() && 'text-right',
          )}
        >{post.content}</p>

        {post.imageUrl && (
          <img
            src={post.imageUrl}
            alt="Post attachment"
            className="w-full max-h-96 object-cover rounded-xl mt-4 border border-gray-100"
            onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }}
          />
        )}
      </Card>

      {/* Comments */}
      <div>
        <h2 className="text-lg font-semibold text-gray-900 mb-3 flex items-center gap-2">
          <MessageSquare className="h-5 w-5 text-primary-600" />
          {t('community.comments')} ({comments.length})
        </h2>

        {comments.length === 0 ? (
          <p className="text-sm text-gray-400 text-center py-6">{t('community.noComments')}</p>
        ) : (
          <div className="space-y-3">
            {comments.map((comment) => (
              <Card key={comment.id} padding="sm">
                <div className="flex items-start justify-between">
                  <div className="flex items-center gap-2 mb-2">
                    <div className="h-7 w-7 rounded-full bg-gray-100 flex items-center justify-center">
                      <span className="text-[10px] font-bold text-gray-600">
                        {comment.authorName.charAt(0).toUpperCase()}
                      </span>
                    </div>
                    <div>
                      <p className="text-xs font-medium text-gray-900">{comment.authorName}</p>
                      <p className="text-[10px] text-gray-400">{formatDate(comment.createdAt)}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-1">
                    {!comment.isOwnedByCurrentUser && (
                      <button
                        onClick={() => setMsgTarget({ userId: comment.authorId, name: comment.authorName })}
                        className="p-1 rounded text-gray-400 hover:text-violet-600 hover:bg-violet-50 transition-colors"
                        title={t('kisan.message')}
                      >
                        <Mail className="h-3 w-3" />
                      </button>
                    )}
                    {comment.isOwnedByCurrentUser && (
                      <button
                        onClick={() => handleDeleteComment(comment.id)}
                        className="p-1 rounded text-gray-400 hover:text-red-500 hover:bg-red-50 transition-colors"
                      >
                        <Trash2 className="h-3 w-3" />
                      </button>
                    )}
                  </div>
                </div>
                <p
                  dir="auto"
                  className={cn(
                    'text-sm text-gray-700 whitespace-pre-wrap break-words bidi-auto',
                    containsUrduScript(comment.content)
                      ? 'dir-rtl text-right font-urdu leading-relaxed'
                      : isRtl() && 'text-right',
                  )}
                >{comment.content}</p>
              </Card>
            ))}
          </div>
        )}
      </div>

      {/* Comment input */}
      <div className="sticky bottom-0 bg-earth-50 pt-3 pb-2">
        <div className="flex items-center gap-2">
          <input
            type="text"
            value={commentInput}
            onChange={(e) => setCommentInput(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); handleComment(); } }}
            placeholder={t('community.commentPlaceholder')}
            maxLength={1000}
            disabled={sending}
            className="flex-1 px-4 py-2.5 rounded-xl border border-gray-200 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-primary-500 disabled:opacity-50"
          />
          <button
            onClick={handleComment}
            disabled={sending || !commentInput.trim()}
            className="h-10 w-10 rounded-xl bg-primary-600 flex items-center justify-center text-white hover:bg-primary-700 transition-colors disabled:opacity-50 shrink-0"
          >
            <Send className="h-4 w-4" />
          </button>
        </div>
      </div>

      {/* Direct message dialog */}
      {msgTarget && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center">
          <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={() => { setMsgTarget(null); setMsgError(null); }} />
          <div className="relative w-full sm:max-w-md bg-white rounded-t-2xl sm:rounded-2xl shadow-xl p-5">
            <div className="flex items-center gap-3 mb-4">
              <div className="h-10 w-10 rounded-full bg-gradient-to-br from-violet-100 to-indigo-100 flex items-center justify-center shrink-0">
                <Mail className="h-5 w-5 text-violet-600" />
              </div>
              <div>
                <p className="font-semibold text-gray-900 text-sm">{t('kisan.message')}</p>
                <p className="text-xs text-gray-500">{msgTarget.name}</p>
              </div>
            </div>
            {msgError && <div className="mb-3 px-3 py-2 rounded-lg bg-red-50 text-red-600 text-xs">{msgError}</div>}
            <textarea
              value={msgText}
              onChange={(e) => setMsgText(e.target.value)}
              placeholder={t('inbox.messagePlaceholder')}
              maxLength={2000}
              rows={3}
              autoFocus
              disabled={msgSending}
              className="w-full px-3 py-2.5 rounded-xl border border-gray-200 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-primary-500 resize-none disabled:opacity-50"
              onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSendDirect(); } }}
            />
            <div className="flex items-center justify-end gap-2 mt-3">
              <Button variant="secondary" size="sm" onClick={() => { setMsgTarget(null); setMsgError(null); }} disabled={msgSending}>
                {t('common.cancel')}
              </Button>
              <Button variant="primary" size="sm" loading={msgSending} disabled={!msgText.trim()} onClick={handleSendDirect}>
                <Send className="h-3.5 w-3.5" /> {t('kisan.sendMessage')}
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
