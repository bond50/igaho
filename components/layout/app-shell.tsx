"use client";



import Link from 'next/link';

import { useRouter, useSearchParams } from 'next/navigation';

import { FormEvent, KeyboardEvent as ReactKeyboardEvent, MouseEvent as ReactMouseEvent, useEffect, useMemo, useRef, useState } from 'react';

import { AlertTriangle, Award, BarChart3, Bell, ChevronDown, ChevronsLeftRight, ClipboardList, CreditCard, FilePenLine, FolderOpenDot, LayoutDashboard, PanelLeft, ReceiptText, Search, Settings2, ShieldCheck, UserRoundCog, X } from 'lucide-react';
import { toast } from 'sonner';

import { markHeaderNotificationsRead } from '@/features/application/actions/notifications';

import { LogoutButton } from '@/features/auth/components/logout-button';

import { AppBreadcrumb } from '@/components/layout/app-breadcrumb';
import { DEFAULT_ORGANIZATION_NAME, DEFAULT_ORGANIZATION_SHORT_NAME, getOrganizationBrandMark } from '@/features/application/lib/portal-branding';
import { cn } from '@/lib/utils';



type HeaderNotificationItem = {

  id: string;

  kind: 'application' | 'payment_activity' | 'payment_incident' | 'portal_warning';

  title: string;

  detail: string;

  href: string;

  severity: 'info' | 'warning' | 'critical';

  createdAt: string | Date;

  unread: boolean;

};



type AppShellProps = {

  children: React.ReactNode;

  currentPath: '/apply' | '/dashboard' | '/dashboard/setup-assistant' | '/dashboard/settings' | '/dashboard/certificate' | '/dashboard/card' | '/dashboard/payments' | '/profile';

  isAdmin?: boolean;

  heading: string;

  description: string;

  pageActions?: React.ReactNode;
  canAccessApplicationForm?: boolean;
  canViewCertificate?: boolean;
  canViewMembershipCard?: boolean;
  onboardingLocked?: boolean;
  profileIncomplete?: boolean;

  notifications?: {

    unreadCount: number;

    items: HeaderNotificationItem[];

  };

  organizationName?: string;

  organizationShortName?: string;

  accountState?: string;

  footerMode?: 'default' | 'minimal' | 'hidden';

};



type QuickActionItem = {

  href: string;

  label: string;

  detail: string;

  icon: typeof Search;

  group: 'Navigation' | 'Member tools' | 'Admin';

};



const memberNav = [

  { href: '/dashboard', label: 'Member portal', icon: ClipboardList },

  { href: '/dashboard/certificate', label: 'Certificate', icon: Award },

  { href: '/dashboard/card', label: 'Membership card', icon: CreditCard },

  { href: '/dashboard/payments', label: 'Payment history', icon: ReceiptText },

  { href: '/profile', label: 'My profile', icon: UserRoundCog },

  { href: '/apply', label: 'Application form', icon: FilePenLine },

] as const;



const adminNav = [

  { href: '/dashboard', label: 'Admin dashboard', icon: BarChart3 },

  { href: '/dashboard/setup-assistant', label: 'Setup assistant', icon: FolderOpenDot },

  { href: '/dashboard/settings', label: 'Application settings', icon: Settings2 },

] as const;



const sharedMemberToolsNav = [

  { href: '/dashboard/certificate', label: 'Certificate', icon: Award },

  { href: '/dashboard/card', label: 'Membership card', icon: CreditCard },

  { href: '/dashboard/payments', label: 'Payment history', icon: ReceiptText },

  { href: '/profile', label: 'My profile', icon: UserRoundCog },

  { href: '/apply', label: 'Application form', icon: FilePenLine },

] as const;



const onboardingNav = [

  { href: '/profile', label: 'My profile', icon: UserRoundCog },

  { href: '/apply', label: 'Application form', icon: FilePenLine },

] as const;



function formatRelativeTime(value: string | Date) {

  const date = value instanceof Date ? value : new Date(value);

  const diffMs = date.getTime() - Date.now();

  const rtf = new Intl.RelativeTimeFormat('en', { numeric: 'auto' });

  const minutes = Math.round(diffMs / 60000);

  const hours = Math.round(diffMs / 3600000);

  const days = Math.round(diffMs / 86400000);



  if (Math.abs(minutes) < 60) return rtf.format(minutes, 'minute');

  if (Math.abs(hours) < 24) return rtf.format(hours, 'hour');

  return rtf.format(days, 'day');

}



const breadcrumbMap: Record<AppShellProps['currentPath'], string[]> = {

  '/apply': ['Dashboard', 'Application form'],

  '/dashboard': ['Dashboard'],

  '/dashboard/setup-assistant': ['Dashboard', 'Setup assistant'],

  '/dashboard/settings': ['Dashboard', 'Settings'],

  '/dashboard/certificate': ['Dashboard', 'Certificate'],

  '/dashboard/card': ['Dashboard', 'Membership card'],

  '/dashboard/payments': ['Dashboard', 'Payments'],

  '/profile': ['Dashboard', 'Profile'],

};



export function AppShell({ children, currentPath, isAdmin = false, heading, description, pageActions, canAccessApplicationForm = true, canViewCertificate = true, canViewMembershipCard = true, onboardingLocked = false, profileIncomplete = false, notifications, organizationName = DEFAULT_ORGANIZATION_NAME, organizationShortName = DEFAULT_ORGANIZATION_SHORT_NAME, accountState, footerMode = 'default' }: AppShellProps) {

  const router = useRouter();

  const searchParams = useSearchParams();

  const [isDesktop, setIsDesktop] = useState(false);

  const [sidebarOpen, setSidebarOpen] = useState(false);

  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);

  const [quickActionsOpen, setQuickActionsOpen] = useState(false);

  const [selectedActionIndex, setSelectedActionIndex] = useState(0);

  const [liveNotifications, setLiveNotifications] = useState(notifications ?? { unreadCount: 0, items: [] });

  const [notificationFilter, setNotificationFilter] = useState<'all' | 'payments' | 'applications'>('all');

  const [notificationsOpen, setNotificationsOpen] = useState(false);

  const [userMenuOpen, setUserMenuOpen] = useState(false);

  const [showFullMobileDescription, setShowFullMobileDescription] = useState(false);

  const [recentActionHrefs, setRecentActionHrefs] = useState<string[]>([]);

  const initialSearch = useMemo(() => searchParams.get('q') ?? '', [searchParams]);

  const [searchQuery, setSearchQuery] = useState(initialSearch);

  const [markingNotificationId, setMarkingNotificationId] = useState<string | null>(null);

  const [clearingNotificationId, setClearingNotificationId] = useState<string | null>(null);

  const [clearingAll, setClearingAll] = useState(false);

  const quickActionsRef = useRef<HTMLDivElement | null>(null);

  const notificationsRef = useRef<HTMLDivElement | null>(null);

  const userMenuRef = useRef<HTMLDivElement | null>(null);

  const quickActionsInputRef = useRef<HTMLInputElement | null>(null);

  const quickActionRefs = useRef<(HTMLButtonElement | null)[]>([]);



  useEffect(() => {

    if (typeof window === 'undefined') {

      return;

    }



    const desktopQuery = window.matchMedia('(min-width: 1280px)');

    const syncViewport = (matches: boolean) => {

      setIsDesktop(matches);

      setSidebarOpen(matches);

      if (!matches) {

        setSidebarCollapsed(false);

      }

    };



    syncViewport(desktopQuery.matches);



    const handleChange = (event: MediaQueryListEvent) => {

      syncViewport(event.matches);

    };



    desktopQuery.addEventListener('change', handleChange);

    return () => {

      desktopQuery.removeEventListener('change', handleChange);

    };

  }, []);



  useEffect(() => {

    setSearchQuery(initialSearch);

  }, [initialSearch]);



  useEffect(() => {

    setLiveNotifications(notifications ?? { unreadCount: 0, items: [] });

  }, [notifications]);



  const userLabel = isAdmin ? 'Administrator' : 'Member account';
  const brandMark = getOrganizationBrandMark(organizationShortName);
  const showOnboardingNavOnly = onboardingLocked && !isAdmin;

  const roleLabel = isAdmin ? 'Admin + member access' : showOnboardingNavOnly ? (profileIncomplete ? 'Complete profile first' : 'Application in progress') : 'Member tools';

  const breadcrumbs = breadcrumbMap[currentPath];

  const navSections = isAdmin
    ? [
        { label: 'Operations', tone: 'Admin only', items: adminNav },
        { label: 'Member tools', tone: 'Shared member access', items: sharedMemberToolsNav },
      ]
    : showOnboardingNavOnly
      ? [{ label: 'Get started', tone: profileIncomplete ? 'Complete your profile' : 'Finish your application', items: onboardingNav }]
      : [{ label: 'Member tools', tone: 'Your account', items: memberNav }];

  const quickActions: QuickActionItem[] = showOnboardingNavOnly
    ? [
        { href: '/profile', label: 'Open profile', detail: 'Complete the profile before continuing.', icon: UserRoundCog, group: 'Member tools' },
        { href: '/apply', label: 'Open application form', detail: 'Continue after your profile is complete.', icon: FilePenLine, group: 'Member tools' },
      ]
    : [
        { href: '/dashboard', label: isAdmin ? 'Open admin dashboard' : 'Open member portal', detail: 'Go to the main dashboard overview.', icon: LayoutDashboard, group: 'Navigation' },
        { href: '/dashboard/payments', label: 'Open payments', detail: 'Review payment history and payment operations.', icon: ReceiptText, group: 'Navigation' },
        ...(isAdmin ? [
          { href: '/dashboard/setup-assistant', label: 'Open setup assistant', detail: 'Run the guided portal setup flow.', icon: FolderOpenDot, group: 'Admin' as const },
          { href: '/dashboard/settings', label: 'Open settings', detail: 'Manage application and payment settings.', icon: Settings2, group: 'Admin' as const },
        ] : []),
        ...(canAccessApplicationForm ? [{ href: '/apply', label: 'Open application form', detail: 'Continue the application and payment flow.', icon: FilePenLine, group: 'Member tools' as const }] : []),
        { href: '/profile', label: 'Open profile', detail: 'Manage account and member profile details.', icon: UserRoundCog, group: 'Member tools' },
        ...(canViewCertificate ? [{ href: '/dashboard/certificate', label: 'Open certificate', detail: 'View or print the membership certificate.', icon: Award, group: 'Member tools' as const }] : []),
        ...(canViewMembershipCard ? [{ href: '/dashboard/card', label: 'Open membership card', detail: 'View the digital membership card.', icon: CreditCard, group: 'Member tools' as const }] : []),
      ];

  const filteredQuickActions = useMemo(() => {

    const filter = searchQuery.trim().toLowerCase();

    const recencyBoost = (href: string) => {

      const index = recentActionHrefs.indexOf(href);

      return index === -1 ? 0 : Math.max(0, 4 - index);

    };



    if (!filter) {

      return [...quickActions].sort((a, b) => recencyBoost(b.href) - recencyBoost(a.href) || a.label.localeCompare(b.label));

    }



    return quickActions

      .map((item) => {

        const haystack = `${item.label} ${item.detail} ${item.href} ${item.group}`.toLowerCase();

        if (item.label.toLowerCase() === filter) return { item, score: 10 + recencyBoost(item.href) };

        if (item.label.toLowerCase().startsWith(filter)) return { item, score: 7 + recencyBoost(item.href) };

        if (haystack.includes(filter)) return { item, score: 4 + recencyBoost(item.href) };

        return null;

      })

      .filter((entry): entry is { item: QuickActionItem; score: number } => Boolean(entry))

      .sort((a, b) => b.score - a.score || a.item.label.localeCompare(b.item.label))

      .map((entry) => entry.item);

  }, [quickActions, recentActionHrefs, searchQuery]);



  const filteredNotifications = useMemo(() => {

    if (notificationFilter === 'payments') {

      return liveNotifications.items.filter((item) => item.kind === 'payment_activity' || item.kind === 'payment_incident');

    }



    if (notificationFilter === 'applications') {

      return liveNotifications.items.filter((item) => item.kind === 'application' || item.kind === 'portal_warning');

    }



    return liveNotifications.items;

  }, [liveNotifications.items, notificationFilter]);



  const paymentIssueCount = liveNotifications.items.filter((item) => item.kind === 'payment_incident').length;

  const pendingReviewCount = liveNotifications.items.filter((item) => item.kind === 'application' && item.unread).length;

  const headerStatus = isAdmin

    ? paymentIssueCount

      ? `${paymentIssueCount} payment issue${paymentIssueCount === 1 ? '' : 's'}`

      : `${pendingReviewCount} pending review${pendingReviewCount === 1 ? '' : 's'}`

    : 'Member workspace';



  const paymentNotificationCount = liveNotifications.items.filter((item) => item.kind === 'payment_activity' || item.kind === 'payment_incident').length;

  const applicationNotificationCount = liveNotifications.items.filter((item) => item.kind === 'application' || item.kind === 'portal_warning').length;

  const accountStateLabel = accountState ?? (isAdmin ? 'Full access' : 'Portal active');

  const activeSectionLabel = navSections.find((section) => section.items.some((item) => item.href === currentPath))?.label ?? 'Navigation';

  const shouldHideFooter = footerMode === 'hidden';

  const footerState = isAdmin

    ? paymentIssueCount

      ? `${paymentIssueCount} payment issue${paymentIssueCount === 1 ? '' : 's'} open`

      : `${pendingReviewCount} pending review${pendingReviewCount === 1 ? '' : 's'}`

    : 'Portal open';



  useEffect(() => {

    if (!quickActionsOpen) {

      return;

    }



    setSelectedActionIndex(0);

    quickActionsInputRef.current?.focus();

  }, [quickActionsOpen]);



  useEffect(() => {

    if (!quickActionsOpen) {

      return;

    }



    if (filteredQuickActions.length === 0) {

      setSelectedActionIndex(0);

      return;

    }



    setSelectedActionIndex((current) => Math.min(current, filteredQuickActions.length - 1));

  }, [filteredQuickActions.length, quickActionsOpen]);



  useEffect(() => {

    if (!quickActionsOpen || filteredQuickActions.length === 0) {

      return;

    }



    quickActionRefs.current[selectedActionIndex]?.scrollIntoView({ block: 'nearest' });

  }, [filteredQuickActions.length, quickActionsOpen, selectedActionIndex]);



  useEffect(() => {

    function handleKeyDown(event: KeyboardEvent) {

      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'k') {

        event.preventDefault();

        setQuickActionsOpen((current) => !current);

        return;

      }



      if (event.key === 'Escape') {

        setQuickActionsOpen(false);

      }

    }



    function handlePointerDown(event: MouseEvent) {

      const target = event.target as Node;



      if (quickActionsRef.current && !quickActionsRef.current.contains(target)) {

        setQuickActionsOpen(false);

      }



      if (notificationsRef.current && !notificationsRef.current.contains(target)) {

        setNotificationsOpen(false);

      }



      if (userMenuRef.current && !userMenuRef.current.contains(target)) {

        setUserMenuOpen(false);

      }

    }



    window.addEventListener('keydown', handleKeyDown);

    window.addEventListener('mousedown', handlePointerDown);



    return () => {

      window.removeEventListener('keydown', handleKeyDown);

      window.removeEventListener('mousedown', handlePointerDown);

    };

  }, []);



  function rememberQuickAction(href: string) {

    setRecentActionHrefs((current) => {

      const next = [href, ...current.filter((item) => item !== href)].slice(0, 5);

      if (typeof window !== 'undefined') {

        try {

          window.localStorage.setItem('igano-recent-quick-actions', JSON.stringify(next));

        } catch {

          // Ignore local storage issues.

        }

      }

      return next;

    });

  }



  function navigateToAppSection(href: string) {

    if (profileIncomplete && href === '/apply' && currentPath !== '/apply') {

      toast.error('Please update your profile first.');

      return false;

    }

    rememberQuickAction(href);

    router.push(href);

    return true;

  }



  function handleNavLinkClick(event: ReactMouseEvent<HTMLAnchorElement>, href: string, closeMenu?: () => void) {

    if (!navigateToAppSection(href)) {

      event.preventDefault();

      closeMenu?.();

      if (!isDesktop) {

        setSidebarOpen(false);

      }

      return;

    }

    closeMenu?.();

    if (!isDesktop) {

      setSidebarOpen(false);

    }

  }



  function openQuickAction(item: QuickActionItem) {

    if (!navigateToAppSection(item.href)) {

      setQuickActionsOpen(false);

      return;

    }

    setQuickActionsOpen(false);

  }



  function handleSearchSubmit(event: FormEvent<HTMLFormElement>) {

    event.preventDefault();



    const query = searchQuery.trim();

    setQuickActionsOpen(false);



    if (!query) {

      router.push('/dashboard');

      return;

    }



    const params = new URLSearchParams();

    params.set('q', query);

    router.push(`/dashboard?${params.toString()}`);

  }



  function handleQuickActionsKeyDown(event: ReactKeyboardEvent<HTMLInputElement>) {

    if (filteredQuickActions.length === 0) {

      return;

    }



    if (event.key === 'ArrowDown') {

      event.preventDefault();

      setSelectedActionIndex((current) => (current + 1) % filteredQuickActions.length);

      return;

    }



    if (event.key === 'ArrowUp') {

      event.preventDefault();

      setSelectedActionIndex((current) => (current - 1 + filteredQuickActions.length) % filteredQuickActions.length);

      return;

    }



    if (event.key === 'Enter' && !searchQuery.trim()) {

      event.preventDefault();

      openQuickAction(filteredQuickActions[selectedActionIndex]);

    }

  }



  async function handleNotificationClick(item: HeaderNotificationItem) {

    setMarkingNotificationId(item.id);



    try {

      const response = await fetch('/api/header-notifications/read', {

        method: 'POST',

        headers: { 'Content-Type': 'application/json' },

        credentials: 'same-origin',

        body: JSON.stringify({ createdAt: item.createdAt }),

      });



      if (response.ok) {

        setLiveNotifications((current) => ({

          unreadCount: Math.max(0, current.unreadCount - (item.unread ? 1 : 0)),

          items: current.items.map((entry) => (entry.id === item.id ? { ...entry, unread: false } : entry)),

        }));

      }

    } finally {

      setMarkingNotificationId(null);

      router.push(item.href);

    }

  }



  async function clearNotification(notificationId: string) {

    setClearingNotificationId(notificationId);



    try {

      const response = await fetch('/api/header-notifications/clear', {

        method: 'POST',

        headers: { 'Content-Type': 'application/json' },

        credentials: 'same-origin',

        body: JSON.stringify({ notificationId }),

      });



      if (!response.ok) {

        return;

      }



      setLiveNotifications((current) => {

        const target = current.items.find((item) => item.id === notificationId);

        const nextItems = current.items.filter((item) => item.id !== notificationId);

        return {

          unreadCount: Math.max(0, current.unreadCount - (target?.unread ? 1 : 0)),

          items: nextItems,

        };

      });

    } finally {

      setClearingNotificationId(null);

    }

  }



  async function clearAllNotifications() {

    const notificationIds = liveNotifications.items.map((item) => item.id);

    if (notificationIds.length === 0) {

      return;

    }



    setClearingAll(true);



    try {

      const response = await fetch('/api/header-notifications/clear', {

        method: 'POST',

        headers: { 'Content-Type': 'application/json' },

        credentials: 'same-origin',

        body: JSON.stringify({ notificationIds }),

      });



      if (!response.ok) {

        return;

      }



      setLiveNotifications({ unreadCount: 0, items: [] });

    } finally {

      setClearingAll(false);

    }

  }



  useEffect(() => {

    if (typeof window === 'undefined') {

      return;

    }



    try {

      const raw = window.localStorage.getItem('igano-recent-quick-actions');

      if (raw) {

        const parsed = JSON.parse(raw);

        if (Array.isArray(parsed)) {

          setRecentActionHrefs(parsed.filter((item) => typeof item === 'string'));

        }

      }

    } catch {

      // Ignore local storage issues.

    }

  }, []);



  useEffect(() => {

    const stream = new EventSource('/api/header-notifications/stream');



    stream.onmessage = (event) => {

      try {

        const nextNotifications = JSON.parse(event.data) as {

          unreadCount: number;

          items: HeaderNotificationItem[];

        };

        setLiveNotifications(nextNotifications);

      } catch {

        // Ignore malformed stream payloads and wait for the next event.

      }

    };



    stream.onerror = () => {

      // EventSource retries automatically; keep the connection alive unless unmounted.

    };



    return () => {

      stream.close();

    };

  }, []);



  return (

    <main className="portal-shell">

      <div

        className={cn(

          'fixed inset-0 z-30 bg-slate-950/20 transition-opacity xl:hidden',

          sidebarOpen ? 'opacity-100' : 'pointer-events-none opacity-0',

        )}

        onClick={() => setSidebarOpen(false)}

      />



      <aside

        className={cn(

          'portal-sidebar fixed inset-y-0 left-0 z-40 transition-transform duration-300',

          sidebarCollapsed ? 'xl:w-[92px]' : 'w-[300px]',

          isDesktop || sidebarOpen ? 'translate-x-0' : '-translate-x-full',

        )}

      >

        <div className="portal-sidebar-top">

          <div className="mb-3 flex items-center justify-between gap-3 xl:hidden">

            <div>

              <p className="text-sm font-semibold text-slate-950">Navigation</p>

              <p className="text-xs text-slate-500">Open sections and member tools.</p>

            </div>

            <button type="button" className="portal-icon-button h-9 w-9" onClick={() => setSidebarOpen(false)} aria-label="Close navigation">

              <X className="h-4 w-4" />

            </button>

          </div>

          {sidebarCollapsed ? (
            <div className="portal-collapsed-context hidden xl:flex">
              <span className="portal-collapsed-context-label">{activeSectionLabel}</span>
            </div>
          ) : null}

          <div className="portal-brand">

            <div className="portal-brand-mark">{brandMark}</div>

            {!sidebarCollapsed ? (

              <div className="sidebar-copy min-w-0 flex-1">

                <p className="truncate text-base font-semibold text-slate-950">{organizationShortName}</p>

                <p className="mt-1 truncate text-xs font-medium uppercase tracking-[0.12em] text-slate-400">{organizationName}</p>

              </div>

            ) : null}

          </div>

        </div>

        <div className="portal-sidebar-body">
          {navSections.map((section) => (
            <div key={section.label} className="portal-sidebar-group portal-sidebar-section">
              {!sidebarCollapsed ? (
                <div className="mb-3">
                  <p className="portal-sidebar-label">{section.label}</p>
                  <p className="portal-sidebar-tone">{section.tone}</p>
                </div>
              ) : null}

              <div className="space-y-1.5">
                {section.items.map((item) => {
                  const Icon = item.icon;
                  const active = currentPath === item.href;
                  return (
                    <Link
                      key={item.href}
                      href={item.href}
                      scroll={false}
                      title={sidebarCollapsed ? item.label : undefined}
                      className={cn('group portal-nav-item', active && 'portal-nav-item-active', sidebarCollapsed && 'justify-center px-0')}
                      onClick={(event) => {
                        handleNavLinkClick(event, item.href);
                      }}
                    >
                      <span className={cn('portal-nav-icon', active && 'portal-nav-icon-active')}>
                        <Icon className="h-4 w-4" />
                      </span>
                      {!sidebarCollapsed ? <span className="truncate">{item.label}</span> : null}
                    </Link>
                  );
                })}
              </div>
            </div>
          ))}
        </div>

        <div className="portal-sidebar-footer">

          <div className={cn('portal-sidebar-mini-card', sidebarCollapsed && 'justify-center px-0')}>

            <ShieldCheck className="h-4 w-4 text-[var(--brand)]" />

            {!sidebarCollapsed ? <span>{roleLabel}</span> : null}

          </div>

          <div className="flex items-center gap-2">

            {isDesktop ? (

              <button

                type="button"

                className="portal-icon-button hidden xl:inline-flex"

                aria-label={sidebarCollapsed ? 'Expand navigation' : 'Collapse navigation'}

                onClick={() => setSidebarCollapsed((value) => !value)}

              >

                <ChevronsLeftRight className="h-4 w-4" />

              </button>

            ) : null}

            <LogoutButton className={cn('flex-1 justify-center rounded-xl border-slate-200', sidebarCollapsed && 'hidden xl:flex')} />

          </div>

        </div>

      </aside>

      <div className={cn('portal-main-shell', isDesktop && sidebarCollapsed && 'portal-main-shell-collapsed')}>

        <header className="portal-header">

          <div className="portal-topbar">

            <div className="flex min-w-0 flex-1 items-center gap-2 sm:gap-3">
              <button
                type="button"
                className="portal-icon-button xl:hidden"
                aria-label="Open navigation"
                onClick={() => setSidebarOpen(true)}
              >
                <PanelLeft className="h-5 w-5" />
              </button>

              <div ref={quickActionsRef} className="min-w-0 flex-1">
                <button
                  type="button"
                  className="portal-command-trigger w-full lg:max-w-md"
                  aria-label="Open quick actions"
                  aria-expanded={quickActionsOpen}
                  onClick={() => {
                    setQuickActionsOpen((current) => !current);
                    setNotificationsOpen(false);
                    setUserMenuOpen(false);
                  }}
                >
                  <Search className="h-4 w-4 shrink-0" />
                  <span className="truncate text-left">{searchQuery.trim() ? searchQuery : 'Search pages, actions, and tools'}</span>
                  <span className="portal-command-shortcut hidden sm:inline-flex">Ctrl K</span>
                </button>

                {quickActionsOpen ? (
                  <div className="fixed inset-x-4 top-20 z-30 rounded-2xl border border-slate-200 bg-white p-3 shadow-[0_18px_40px_rgba(15,23,42,0.08)] md:absolute md:left-0 md:top-auto md:mt-2 md:w-[min(640px,calc(100vw-3rem))]">
                    <form className="space-y-3" onSubmit={handleSearchSubmit}>
                      <div className="portal-command-input">
                        <Search className="h-4 w-4 shrink-0" />
                        <input
                          ref={quickActionsInputRef}
                          className="portal-search-input"
                          value={searchQuery}
                          onChange={(event) => setSearchQuery(event.target.value)}
                          onKeyDown={handleQuickActionsKeyDown}
                          placeholder="Search pages, actions, and tools"
                        />
                      </div>

                      <div className="max-h-[320px] overflow-y-auto">
                        {filteredQuickActions.length ? (
                          <div className="space-y-1.5">
                            {filteredQuickActions.map((item, index) => {
                              const Icon = item.icon;
                              const active = index === selectedActionIndex;

                              return (
                                <button
                                  key={item.href}
                                  ref={(element) => {
                                    quickActionRefs.current[index] = element;
                                  }}
                                  type="button"
                                  className={cn(
                                    'portal-command-item w-full items-start gap-3 text-left',
                                    active && 'bg-slate-50 ring-1 ring-slate-200',
                                  )}
                                  onMouseEnter={() => setSelectedActionIndex(index)}
                                  onClick={() => openQuickAction(item)}
                                >
                                  <span className="portal-nav-icon mt-0.5 h-9 w-9 shrink-0">
                                    <Icon className="h-4 w-4" />
                                  </span>
                                  <span className="min-w-0 flex-1">
                                    <span className="block text-sm font-medium text-slate-900">{item.label}</span>
                                    <span className="mt-1 block text-xs leading-5 text-slate-500">{item.detail}</span>
                                  </span>
                                </button>
                              );
                            })}
                          </div>
                        ) : (
                          <div className="rounded-xl border border-dashed border-slate-200 px-4 py-6 text-sm text-slate-500">
                            No quick actions match that search.
                          </div>
                        )}
                      </div>
                    </form>
                  </div>
                ) : null}
              </div>

              <div className="hidden rounded-full border border-slate-200 bg-slate-50 px-3 py-1.5 text-xs font-medium text-slate-600 md:inline-flex">

                {headerStatus}

              </div>
            </div>

            <div className="flex shrink-0 items-center gap-2 sm:gap-3">

              <div ref={notificationsRef} className="relative">

                <button

                  type="button"

                  className="portal-icon-button relative"

                  aria-label="Notifications"

                  aria-expanded={notificationsOpen}

                  onClick={() => {

                    setNotificationsOpen((current) => !current);

                    setUserMenuOpen(false);

                  }}

                >

                  <Bell className="h-5 w-5" />

                  {liveNotifications?.unreadCount ? <span className="absolute right-2.5 top-2.5 h-2 w-2 rounded-full bg-[var(--brand)]" /> : null}

                </button>

                {notificationsOpen ? (

                <div className="fixed inset-x-4 top-20 z-30 rounded-2xl border border-slate-200 bg-white p-2 shadow-[0_18px_40px_rgba(15,23,42,0.08)] md:absolute md:inset-x-auto md:right-0 md:top-auto md:mt-2 md:w-[360px]">

                  <div className="border-b border-slate-100 px-3 py-3">

                    <div className="flex items-center justify-between gap-3">

                      <div>

                        <p className="text-sm font-medium text-slate-900">Notifications</p>

                        <p className="mt-1 text-xs text-slate-500">Recent application events, payment incidents, and portal warnings.</p>

                      </div>

                      <div className="flex items-center gap-3">

                        {liveNotifications?.unreadCount ? (

                          <form action={markHeaderNotificationsRead}>

                            <button type="submit" className="text-xs font-medium text-[var(--brand)] hover:underline">

                              Mark all as read

                            </button>

                          </form>

                        ) : null}

                        {liveNotifications?.items?.length ? (

                          <button

                            type="button"

                            className="text-xs font-medium text-slate-500 hover:text-slate-700"

                            disabled={clearingAll}

                            onClick={() => {

                              void clearAllNotifications();

                            }}

                          >

                            {clearingAll ? 'Clearing...' : 'Clear all'}

                          </button>

                        ) : null}

                      </div>

                    </div>

                  </div>

                  <div className="mt-3 flex gap-2 border-b border-slate-100 px-3 pb-3">

                    {[

                      { key: 'all', label: 'All', count: liveNotifications.items.length },

                      { key: 'payments', label: 'Payments', count: paymentNotificationCount },

                      { key: 'applications', label: 'Applications', count: applicationNotificationCount },

                    ].map((filter) => (

                      <button

                        key={filter.key}

                        type="button"

                        className={cn('rounded-full px-3 py-1 text-xs font-medium', notificationFilter === filter.key ? 'bg-slate-900 text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200')}

                        onClick={() => setNotificationFilter(filter.key as typeof notificationFilter)}

                      >

                        {filter.label}

                      </button>

                    ))}

                  </div>

                  <div className="max-h-[360px] overflow-y-auto py-2">

                    {filteredNotifications.length ? (

                      filteredNotifications.map((item) => (

                        <div

                          key={item.id}

                          className={cn(

                            'group flex items-start gap-3 rounded-xl px-3 py-3 hover:bg-slate-50',

                            item.unread ? 'bg-slate-50/80 ring-1 ring-slate-100' : '',

                            markingNotificationId === item.id || clearingNotificationId === item.id ? 'pointer-events-none opacity-70' : '',

                          )}

                        >

                          <button

                            type="button"

                            className="flex min-w-0 flex-1 items-start gap-3 text-left"

                            onClick={() => {

                              void handleNotificationClick(item);

                            }}

                          >

                            <span className={cn('mt-0.5 flex h-8 w-8 items-center justify-center rounded-lg', item.severity === 'critical' ? 'bg-rose-50 text-rose-600' : item.severity === 'warning' ? 'bg-amber-50 text-amber-600' : 'bg-sky-50 text-sky-600')}>

                              {item.kind === 'payment_incident' ? <AlertTriangle className="h-4 w-4" /> : item.kind === 'payment_activity' ? <ReceiptText className="h-4 w-4" /> : item.kind === 'portal_warning' ? <Settings2 className="h-4 w-4" /> : <FolderOpenDot className="h-4 w-4" />}

                            </span>

                            <div className="min-w-0 flex-1">

                              <div className="flex items-center justify-between gap-3">

                                <p className={cn('text-sm font-medium', item.unread ? 'text-slate-950' : 'text-slate-800')}>{item.title}</p>

                                <div className="flex items-center gap-2">

                                  {item.unread ? <span className="h-2 w-2 rounded-full bg-[var(--brand)]" /> : null}

                                  <span className="text-[11px] text-slate-400">{formatRelativeTime(item.createdAt)}</span>

                                </div>

                              </div>

                              <p className="mt-1 text-xs leading-5 text-slate-500">{item.detail}</p>

                              {item.kind === 'payment_incident' ? (

                                <button

                                  type="button"

                                  className="mt-2 inline-flex rounded-lg border border-slate-200 px-2.5 py-1 text-[11px] font-medium text-slate-700 hover:bg-slate-50"

                                  onClick={(event) => {

                                    event.stopPropagation();

                                    setNotificationsOpen(false);

                                    router.push('/dashboard/payments');

                                  }}

                                >

                                  Open payments

                                </button>

                              ) : null}

                            </div>

                          </button>

                          <button

                            type="button"

                            className="rounded-lg px-2 py-1 text-[11px] font-medium text-slate-400 opacity-0 transition group-hover:opacity-100 hover:bg-slate-100 hover:text-slate-600"

                            onClick={() => {

                              void clearNotification(item.id);

                            }}

                          >

                            {clearingNotificationId === item.id ? '...' : 'Clear'}

                          </button>

                        </div>

                      ))

                    ) : (

                      <div className="px-3 py-6 text-sm text-slate-500">No notifications in this filter.</div>

                    )}

                  </div>

                </div>

                ) : null}

              </div>

              <div ref={userMenuRef} className="relative">

                <button

                  type="button"

                  className="portal-user-chip"

                  aria-expanded={userMenuOpen}

                  onClick={() => {

                    setUserMenuOpen((current) => !current);

                    setNotificationsOpen(false);

                  }}

                >

                  <span className="portal-user-avatar">{brandMark}</span>

                  <div className="hidden sm:block">

                    <p className="text-sm font-medium text-slate-900">{userLabel}</p>

                    <p className="text-xs text-slate-500">{accountStateLabel}</p>

                  </div>

                  <ChevronDown className="h-4 w-4 text-slate-400" />

                </button>

                {userMenuOpen ? (

                <div className="fixed inset-x-4 top-20 z-30 rounded-2xl border border-slate-200 bg-white p-2 shadow-[0_18px_40px_rgba(15,23,42,0.08)] md:absolute md:inset-x-auto md:right-0 md:top-auto md:mt-2 md:w-64">

                  <div className="rounded-xl bg-slate-50 px-3 py-2">

                    <p className="text-sm font-medium text-slate-900">{userLabel}</p>

                    <p className="text-xs text-slate-500">{accountStateLabel}</p>

                  </div>

                  <div className="mt-2 space-y-1">

                    <Link href="/profile" className="flex items-center rounded-xl px-3 py-2 text-sm text-slate-700 hover:bg-slate-50" onClick={(event) => handleNavLinkClick(event, '/profile', () => setUserMenuOpen(false))}>

                      <UserRoundCog className="mr-2 h-4 w-4" />

                      Profile

                    </Link>

                    {!showOnboardingNavOnly ? (<Link href={isAdmin ? '/dashboard/settings' : '/profile'} className="flex items-center rounded-xl px-3 py-2 text-sm text-slate-700 hover:bg-slate-50" onClick={(event) => handleNavLinkClick(event, isAdmin ? '/dashboard/settings' : '/profile', () => setUserMenuOpen(false))}>

                      <Settings2 className="mr-2 h-4 w-4" />

                      Settings

                    </Link>) : null}

                    {showOnboardingNavOnly ? (<Link href="/apply" className="flex items-center rounded-xl px-3 py-2 text-sm text-slate-700 hover:bg-slate-50" onClick={(event) => handleNavLinkClick(event, '/apply', () => setUserMenuOpen(false))}>

                      <FilePenLine className="mr-2 h-4 w-4" />

                      Apply

                    </Link>) : null}

                    {!showOnboardingNavOnly && canViewCertificate ? (<Link href="/dashboard/certificate" className="flex items-center rounded-xl px-3 py-2 text-sm text-slate-700 hover:bg-slate-50" onClick={(event) => handleNavLinkClick(event, '/dashboard/certificate', () => setUserMenuOpen(false))}>

                      <Award className="mr-2 h-4 w-4" />

                      Certificate

                    </Link>) : null}

                    {!showOnboardingNavOnly && canViewMembershipCard ? (<Link href="/dashboard/card" className="flex items-center rounded-xl px-3 py-2 text-sm text-slate-700 hover:bg-slate-50" onClick={(event) => handleNavLinkClick(event, '/dashboard/card', () => setUserMenuOpen(false))}>

                      <CreditCard className="mr-2 h-4 w-4" />

                      Membership card

                    </Link>) : null}

                  </div>

                  <div className="mt-2 border-t border-slate-100 pt-2">

                    <LogoutButton className="w-full justify-start rounded-xl border-transparent px-3 text-slate-700 shadow-none hover:border-slate-200 hover:bg-slate-50" />

                  </div>

                </div>

                ) : null}

              </div>

            </div>

          </div>

        </header>



        <section className="min-w-0 flex-1 space-y-4 px-4 pb-4 pt-4 print:space-y-0 sm:space-y-5 sm:px-5 sm:pb-5 sm:pt-5 xl:px-6 xl:pb-6 xl:pt-6">

          <div className="portal-page-panel">

            <AppBreadcrumb items={breadcrumbs} />

            <div className="portal-page-block">

              <div className="portal-page-copy">

                <h2 className="portal-page-title">{heading}</h2>

                {description ? (

                  <>

                    <p className="portal-page-description hidden sm:block">{description}</p>

                    <div className="mt-1.5 sm:hidden">

                      <p className={cn('portal-page-description', !showFullMobileDescription && 'line-clamp-2')}>{description}</p>

                      {description.length > 96 ? (

                        <button

                          type="button"

                          className="mt-1 text-xs font-medium text-[var(--brand)]"

                          onClick={() => setShowFullMobileDescription((current) => !current)}

                        >

                          {showFullMobileDescription ? 'Less' : 'More'}

                        </button>

                      ) : null}

                    </div>

                  </>

                ) : null}

              </div>

              {pageActions ? <div className="flex flex-wrap items-center gap-2 lg:max-w-[45%] lg:justify-end">{pageActions}</div> : null}

            </div>

          </div>

          {children}

        </section>



        {!shouldHideFooter ? (
        <footer className={cn('portal-footer', footerMode === 'minimal' && 'sm:py-3')}>
          <div className="hidden items-center justify-between gap-4 sm:flex">
            <div className="flex flex-wrap items-center gap-2">
              <span className="portal-footer-pill">{footerState}</span>
              <span className="portal-footer-pill">Live notifications connected</span>
              {isAdmin ? <span className="portal-footer-pill">Operations workspace</span> : <span className="portal-footer-pill">Member workspace</span>}
            </div>
            <span className="text-xs font-medium uppercase tracking-[0.12em] text-slate-400">{organizationName}</span>
          </div>
        </footer>
        ) : null}

      </div>

    </main>

  );

}

