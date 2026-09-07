import { useState, useEffect, useRef, useCallback, type ReactNode } from 'react';
import { NavLink, useNavigate } from 'react-router-dom';
import { useAuth } from '@/hooks/useAuth';
import { notificationApi } from '@/api/notificationApi';
import { t, getLanguage, setLanguage, isRtl } from '@/lib/i18n';
import { cn, formatDateTime } from '@/lib/utils';
import type { NotificationDto } from '@/types';
import {
  LayoutDashboard,
  MapPinned,
  LogOut,
  Menu,
  X,
  Globe,
  User,
  Sprout,
  Bell,
  ClipboardCheck,
  Users,
  TrendingUp,
  Calculator,
  Camera,
  Check,
  CheckCheck,
  ChevronDown,
  Leaf,
  Satellite,
  MailOpen,
  Clock,
} from 'lucide-react';

interface AppShellProps {
  children: ReactNode;
}

/**
 * 4-section navigation (overhauled):
 *   Dashboard | My Farms | Kisan Network | Utilities
 * Group headers keep the number of visible choices small while every
 * feature stays one click away.
 */
interface NavEntry {
  to: string;
  label: string;
  icon: typeof LayoutDashboard;
}

interface NavSection {
  titleKey: string;
  entries: NavEntry[];
}

const navSections: NavSection[] = [
  {
    titleKey: 'nav.section.dashboard',
    entries: [
      { to: '/dashboard', label: 'nav.dashboard', icon: LayoutDashboard },
    ],
  },
  {
    titleKey: 'nav.section.myFarms',
    entries: [
      { to: '/farms', label: 'nav.farms', icon: MapPinned },
      { to: '/monitoring', label: 'nav.cropMonitoring', icon: ClipboardCheck },
      { to: '/notifications', label: 'nav.notifications', icon: Bell },
    ],
  },
  {
    titleKey: 'nav.section.kisanNetwork',
    entries: [
      { to: '/kisan', label: 'nav.kisanNetwork', icon: Users },
    ],
  },
  {
    titleKey: 'nav.section.utilities',
    entries: [
      { to: '/utilities/disease-detection', label: 'nav.diseaseCamera', icon: Camera },
      { to: '/utilities/plant-detector', label: 'nav.plantDetector', icon: Leaf },
      { to: '/utilities/crop-health', label: 'nav.cropHealth', icon: Satellite },
      { to: '/input-calculator', label: 'nav.inputCalculator', icon: Calculator },
      { to: '/crop-prices', label: 'nav.mandiRates', icon: TrendingUp },
    ],
  },
];

export function AppShell({ children }: AppShellProps) {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [unreadCount, setUnreadCount] = useState(0);
  const [lang, setLang] = useState(getLanguage());
  const [langDropdownOpen, setLangDropdownOpen] = useState(false);
  const [notifDropdownOpen, setNotifDropdownOpen] = useState(false);
  const [notifications, setNotifications] = useState<NotificationDto[]>([]);
  const [notifLoading, setNotifLoading] = useState(false);
  const langDropdownRef = useRef<HTMLDivElement>(null);
  const notifDropdownRef = useRef<HTMLDivElement>(null);

  // Refresh unread count from API
  const refreshUnreadCount = useCallback(() => {
    notificationApi.getUnreadCount()
      .then((r) => setUnreadCount(r.count))
      .catch(() => {});
  }, []);

  // Load recent notifications for the dropdown
  const loadNotifications = useCallback(async () => {
    setNotifLoading(true);
    try {
      const data = await notificationApi.getAll(8);
      setNotifications(data);
    } catch {
      // silent
    } finally {
      setNotifLoading(false);
    }
  }, []);

  // Close language dropdown when clicking outside
  useEffect(() => {
    if (!langDropdownOpen) return;
    const handleClickOutside = (e: MouseEvent) => {
      if (langDropdownRef.current && !langDropdownRef.current.contains(e.target as Node)) {
        setLangDropdownOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [langDropdownOpen]);

  // Close notification dropdown when clicking outside
  useEffect(() => {
    if (!notifDropdownOpen) return;
    const handleClickOutside = (e: MouseEvent) => {
      if (notifDropdownRef.current && !notifDropdownRef.current.contains(e.target as Node)) {
        setNotifDropdownOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [notifDropdownOpen]);

  // Initial unread count fetch
  useEffect(() => {
    refreshUnreadCount();
  }, [refreshUnreadCount]);

  const handleLogout = () => {
    logout();
    navigate('/login');
  };

  const switchLanguage = (langCode: string) => {
    if (langCode === lang) {
      setLangDropdownOpen(false);
      return;
    }
    const newLang = langCode as 'en' | 'ur';
    setLanguage(newLang);
    setLang(newLang);
    setLangDropdownOpen(false);
  };

  const toggleNotifDropdown = async () => {
    if (!notifDropdownOpen) {
      await loadNotifications();
      refreshUnreadCount();
    }
    setNotifDropdownOpen((prev) => !prev);
  };

  const handleMarkNotifRead = async (id: string) => {
    try {
      await notificationApi.markRead(id);
      setNotifications((prev) =>
        prev.map((n) => (n.id === id ? { ...n, isRead: true, readAt: new Date().toISOString() } : n)),
      );
      setUnreadCount((prev) => Math.max(0, prev - 1));
    } catch {
      // silent
    }
  };

  const handleMarkAllNotifRead = async () => {
    try {
      await notificationApi.markAllRead();
      setNotifications((prev) =>
        prev.map((n) => ({ ...n, isRead: true, readAt: new Date().toISOString() })),
      );
      setUnreadCount(0);
    } catch {
      // silent
    }
  };

  const handleNotifClick = (n: NotificationDto) => {
    if (!n.isRead) handleMarkNotifRead(n.id);
    setNotifDropdownOpen(false);
    // Navigate based on reference type
    if (n.referenceType === 'CropMonitoringCheck' && n.referenceId) {
      navigate('/monitoring');
    } else {
      navigate('/notifications');
    }
  };

  const activeLangLabel = lang === 'en' ? 'English' : 'اردو';

  const renderNav = (onNavigate?: () => void) => (
    <nav className="flex-1 px-3 py-4 space-y-4 overflow-y-auto">
      {navSections.map((section) => (
        <div key={section.titleKey}>
          <p className="px-3 mb-1.5 text-[10px] font-semibold text-gray-400 uppercase tracking-wider">
            {t(section.titleKey)}
          </p>
          <div className="space-y-1">
            {section.entries.map((item) => (
              <NavLink
                key={item.to}
                to={item.to}
                onClick={onNavigate}
                className={({ isActive }) =>
                  cn(
                    'flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-colors',
                    isActive
                      ? 'bg-primary-50 text-primary-800'
                      : 'text-gray-600 hover:bg-gray-50 hover:text-gray-900',
                  )
                }
              >
                <item.icon className="h-5 w-5 shrink-0" />
                {t(item.label)}
              </NavLink>
            ))}
          </div>
        </div>
      ))}
    </nav>
  );

  const renderUser = () => (
    <div className="p-3 border-t border-gray-100">
      <div className="flex items-center gap-3 px-3 py-2.5 rounded-xl bg-gray-50">
        <div className="h-8 w-8 rounded-full bg-primary-100 flex items-center justify-center shrink-0">
          <User className="h-4 w-4 text-primary-700" />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium text-gray-900 truncate">{user?.fullName}</p>
          <p className="text-xs text-gray-500 truncate">{user?.email || user?.phoneNumber}</p>
        </div>
      </div>
      <button
        onClick={handleLogout}
        className="w-full mt-2 flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg text-xs font-medium text-red-600 hover:bg-red-50 transition-colors"
      >
        <LogOut className="h-3.5 w-3.5" />
        {t('nav.logout')}
      </button>
    </div>
  );

  return (
    <div className="min-h-screen bg-earth-50 flex overflow-x-hidden" dir={isRtl() ? 'rtl' : 'ltr'}>
      {/* Sidebar - Desktop */}
      <aside className={`hidden lg:flex lg:w-64 lg:flex-col lg:fixed lg:inset-y-0 bg-white border-gray-200 ${isRtl() ? 'lg:right-0 lg:border-l' : 'lg:left-0 lg:border-r'}`}>
        {/* Logo */}
        <div className="h-16 flex items-center gap-3 px-6 border-b border-gray-100">
          <div className="h-9 w-9 rounded-xl bg-primary-700 flex items-center justify-center">
            <Sprout className="h-5 w-5 text-white" />
          </div>
          <div>
            <h1 className="text-lg font-bold text-gray-900 tracking-tight">{t('app.name')}</h1>
            <p className="text-[10px] text-gray-500 -mt-0.5 font-medium uppercase tracking-wider">
              {t('app.tagline')}
            </p>
          </div>
        </div>

        {renderNav()}
        {renderUser()}
      </aside>

      {/* Mobile sidebar overlay */}
      {sidebarOpen && (
        <div className="fixed inset-0 z-40 lg:hidden">
          <div className="fixed inset-0 bg-black/40" onClick={() => setSidebarOpen(false)} />
          <div className={`fixed inset-y-0 w-72 bg-white shadow-xl animate-fade-in flex flex-col ${isRtl() ? 'right-0' : 'left-0'}`}>
            {/* Mobile header */}
            <div className="h-16 flex items-center justify-between px-6 border-b border-gray-100">
              <div className="flex items-center gap-3">
                <div className="h-9 w-9 rounded-xl bg-primary-700 flex items-center justify-center">
                  <Sprout className="h-5 w-5 text-white" />
                </div>
                <span className="text-lg font-bold text-gray-900">{t('app.name')}</span>
              </div>
              <button
                onClick={() => setSidebarOpen(false)}
                className="p-2 rounded-lg text-gray-400 hover:bg-gray-100"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            {renderNav(() => setSidebarOpen(false))}

            {/* Mobile user */}
            <div className="border-t border-gray-100 bg-white">
              {renderUser()}
            </div>
          </div>
        </div>
      )}

      {/* Main content */}
      <div className={`flex-1 min-w-0 ${isRtl() ? 'lg:mr-64' : 'lg:ml-64'}`}>
        {/* Top bar */}
        <header className="sticky top-0 z-50 h-16 bg-white/80 backdrop-blur-md border-b border-gray-100 flex items-center px-3 sm:px-4 lg:px-8 gap-2 sm:gap-4 overflow-visible">
          <button
            onClick={() => setSidebarOpen(true)}
            className={`lg:hidden p-2 rounded-lg text-gray-500 hover:bg-gray-100 ${isRtl() ? '-mr-2' : '-ml-2'}`}
            aria-label="Open menu"
          >
            <Menu className="h-5 w-5" />
          </button>

          {/* Breadcrumb-like page indicator (placeholder for current page) */}
          <div className="flex-1" />

          {/* Notification bell + dropdown */}
          <div className="relative" ref={notifDropdownRef}>
            <button
              onClick={toggleNotifDropdown}
              className="relative p-2 rounded-lg text-gray-500 hover:bg-gray-100 hover:text-gray-700 transition-colors"
              title={t('notifications.title')}
            >
              <Bell className="h-5 w-5" />
              {unreadCount > 0 && (
                <span className={`absolute -top-0.5 h-4.5 w-4.5 min-w-[18px] flex items-center justify-center rounded-full bg-red-500 text-[10px] font-bold text-white ring-2 ring-white ${isRtl() ? '-left-0.5' : '-right-0.5'}`}>
                  {unreadCount > 99 ? '99+' : unreadCount}
                </span>
              )}
            </button>

            {notifDropdownOpen && (
              <div className={cn(
                'absolute top-full mt-1.5 w-80 sm:w-96 rounded-xl bg-white shadow-lg ring-1 ring-black/5 z-[100] animate-fade-in overflow-hidden',
                isRtl() ? 'left-0' : 'right-0',
              )}>
                {/* Dropdown header */}
                <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100">
                  <h3 className="text-sm font-semibold text-gray-900">{t('notifications.title')}</h3>
                  {unreadCount > 0 && (
                    <button
                      onClick={handleMarkAllNotifRead}
                      className="flex items-center gap-1 text-xs font-medium text-primary-600 hover:text-primary-700 transition-colors"
                    >
                      <CheckCheck className="h-3.5 w-3.5" />
                      {t('notifications.markAllRead')}
                    </button>
                  )}
                </div>

                {/* Notification list */}
                <div className="max-h-80 overflow-y-auto">
                  {notifLoading ? (
                    <div className="flex items-center justify-center py-8">
                      <div className="h-5 w-5 border-2 border-primary-600 border-t-transparent rounded-full animate-spin" />
                    </div>
                  ) : notifications.length === 0 ? (
                    <div className="flex flex-col items-center justify-center py-8 text-gray-400">
                      <Bell className="h-8 w-8 mb-2" />
                      <p className="text-xs">{t('notifications.empty')}</p>
                    </div>
                  ) : (
                    notifications.map((n) => (
                      <button
                        key={n.id}
                        onClick={() => handleNotifClick(n)}
                        className={cn(
                          'w-full flex items-start gap-3 px-4 py-3 text-left transition-colors hover:bg-gray-50 border-b border-gray-50 last:border-b-0',
                          !n.isRead && 'bg-primary-50/40',
                        )}
                      >
                        <div className={cn(
                          'h-8 w-8 rounded-lg flex items-center justify-center shrink-0 mt-0.5',
                          n.isRead ? 'bg-gray-100' : 'bg-primary-100',
                        )}>
                          <Bell className={cn('h-4 w-4', n.isRead ? 'text-gray-400' : 'text-primary-600')} />
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-1.5 mb-0.5">
                            <p className={cn(
                              'text-xs truncate',
                              n.isRead ? 'font-medium text-gray-600' : 'font-semibold text-gray-900',
                            )}>
                              {n.title}
                            </p>
                            {!n.isRead && (
                              <span className="h-1.5 w-1.5 rounded-full bg-primary-500 shrink-0" />
                            )}
                          </div>
                          <p className="text-[11px] text-gray-500 line-clamp-1">{n.message}</p>
                          <p className="text-[10px] text-gray-400 mt-0.5 flex items-center gap-1">
                            <Clock className="h-2.5 w-2.5" />
                            {formatDateTime(n.createdAt)}
                          </p>
                        </div>
                        {!n.isRead && (
                          <button
                            onClick={(e) => { e.stopPropagation(); handleMarkNotifRead(n.id); }}
                            className="p-1 rounded text-gray-400 hover:text-primary-600 transition-colors shrink-0 mt-0.5"
                            title={t('notifications.markRead')}
                          >
                            <MailOpen className="h-3.5 w-3.5" />
                          </button>
                        )}
                      </button>
                    ))
                  )}
                </div>

                {/* Footer - View all link */}
                {notifications.length > 0 && (
                  <div className="border-t border-gray-100 px-4 py-2.5">
                    <button
                      onClick={() => { setNotifDropdownOpen(false); navigate('/notifications'); }}
                      className="w-full text-center text-xs font-medium text-primary-600 hover:text-primary-700 transition-colors"
                    >
                      {t('notifications.title')} &rarr;
                    </button>
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Language selector dropdown */}
          <div className="relative" ref={langDropdownRef}>
            <button
              onClick={() => setLangDropdownOpen((prev) => !prev)}
              className={cn(
                'flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors',
                langDropdownOpen
                  ? 'bg-gray-100 text-gray-700'
                  : 'text-gray-500 hover:bg-gray-100 hover:text-gray-700',
              )}
            >
              <Globe className="h-3.5 w-3.5" />
              {activeLangLabel}
              <ChevronDown className={cn('h-3 w-3 transition-transform', langDropdownOpen && 'rotate-180')} />
            </button>

            {langDropdownOpen && (
              <div className={cn(
                'absolute top-full mt-1.5 w-36 rounded-xl bg-white shadow-lg ring-1 ring-black/5 py-1 z-[100] animate-fade-in',
                isRtl() ? 'left-0' : 'right-0',
              )}>
                <button
                  onClick={() => switchLanguage('en')}
                  className={cn(
                    'w-full flex items-center gap-2.5 px-3 py-2 text-xs transition-colors',
                    lang === 'en'
                      ? 'bg-primary-50 text-primary-700 font-semibold'
                      : 'text-gray-600 hover:bg-gray-50 hover:text-gray-900',
                  )}
                >
                  <span className="flex-1 text-left">English</span>
                  {lang === 'en' && <Check className="h-3.5 w-3.5 text-primary-600" />}
                </button>
                <button
                  onClick={() => switchLanguage('ur')}
                  className={cn(
                    'w-full flex items-center gap-2.5 px-3 py-2 text-xs transition-colors',
                    lang === 'ur'
                      ? 'bg-primary-50 text-primary-700 font-semibold'
                      : 'text-gray-600 hover:bg-gray-50 hover:text-gray-900',
                  )}
                >
                  <span className="flex-1 text-left font-urdu">اردو</span>
                  {lang === 'ur' && <Check className="h-3.5 w-3.5 text-primary-600" />}
                </button>
              </div>
            )}
          </div>
        </header>

        {/* Page content */}
        <main className="p-3 sm:p-4 lg:p-8 max-w-7xl mx-auto">{children}</main>
      </div>
    </div>
  );
}
