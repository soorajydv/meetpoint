'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { ArrowRight, Bell, BellRing, BookOpen, CalendarClock, Check, CheckCircle2, ChevronRight, Clock, Coins, Facebook, Github, Instagram, Linkedin, TypeIcon as type, LucideIcon, Mail, MessageSquare, Mic, Play, Search, ShieldCheck, Star, User, Video } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import {
  Dialog, DialogContent, DialogDescription, DialogFooter,
  DialogHeader, DialogTitle, DialogTrigger,
} from '@/components/ui/dialog'
import {
  Tabs, TabsContent, TabsList, TabsTrigger,
} from '@/components/ui/tabs'
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select'
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from '@/components/ui/accordion'
import { Skeleton } from '@/components/ui/skeleton'
import { cn } from '@/lib/utils'
import { useToast } from '@/hooks/use-toast'
import ThemeToggle from '@/components/theme-toggle'

type CommMethod = 'chat' | 'audio' | 'video'
type DayOfWeek = 0 | 1 | 2 | 3 | 4 | 5 | 6
type TimeRange = { start: string; end: string }
type WeeklyAvailability = {
  slotDurationMinutes: number
  days: Record<DayOfWeek, TimeRange[]>
}
type Professional = {
  id: string
  name: string
  specialty: string
  feeCoins: number
  methods: CommMethod[]
  bio?: string
  avatar?: string
  availability: WeeklyAvailability
  rating?: number
  reviews?: number
}
type Client = { id: string; name: string; coins: number }
type AppointmentStatus = 'scheduled' | 'completed' | 'cancelled'
type Appointment = {
  id: string
  proId: string
  clientId: string
  startISO: string
  durationMinutes: number
  method: CommMethod
  status: AppointmentStatus
}
type InAppNotification = {
  id: string
  title: string
  body: string
  createdAt: number
  read: boolean
}

/* Utils */
function uid(prefix = 'id') { return `${prefix}_${Math.random().toString(36).slice(2, 10)}` }
function parseHM(hm: string) { const [h, m] = hm.split(':').map(Number); return { h, m } }
function addMinutes(date: Date, mins: number) { const d = new Date(date); d.setMinutes(d.getMinutes() + mins); return d }
function fmtHM(date: Date) { const h = String(date.getHours()).padStart(2, '0'); const m = String(date.getMinutes()).padStart(2, '0'); return `${h}:${m}` }
function setHM(base: Date, hm: string) { const d = new Date(base); const { h, m } = parseHM(hm); d.setHours(h, m, 0, 0); return d }
function getDayOfWeek(date: Date): DayOfWeek { return date.getDay() as DayOfWeek }
function humanDateTime(dt: Date) { return `${dt.toLocaleDateString()} ${dt.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}` }
function dateToYMD(date: Date) { const y = date.getFullYear(); const m = String(date.getMonth() + 1).padStart(2, '0'); const d = String(date.getDate()).padStart(2, '0'); return `${y}-${m}-${d}` }
function ymdToDate(ymd: string) { const [y, m, d] = ymd.split('-').map(Number); return new Date(y, m - 1, d) }
function generateSlotsForDay(date: Date, availability: WeeklyAvailability) {
  const day = getDayOfWeek(date)
  const ranges = availability.days[day] || []
  const slots: { start: Date; end: Date }[] = []
  for (const r of ranges) {
    let cursor = setHM(date, r.start)
    const end = setHM(date, r.end)
    while (addMinutes(cursor, availability.slotDurationMinutes) <= end) {
      const slotEnd = addMinutes(cursor, availability.slotDurationMinutes)
      slots.push({ start: cursor, end: slotEnd })
      cursor = slotEnd
    }
  }
  return slots
}

/* LocalStorage hook */
function useLocalStorage<T>(key: string, initial: T) {
  const [state, setState] = useState<T>(() => {
    try { const raw = localStorage.getItem(key); return raw ? (JSON.parse(raw) as T) : initial } catch { return initial }
  })
  useEffect(() => { try { localStorage.setItem(key, JSON.stringify(state)) } catch {} }, [key, state])
  return [state, setState] as const
}

/* Scroll-in animation */
function useInViewAnimation<T extends HTMLElement>(options?: IntersectionObserverInit) {
  const ref = useRef<T | null>(null)
  useEffect(() => {
    const el = ref.current
    if (!el) return
    const io = new IntersectionObserver((entries) => {
      entries.forEach((entry) => {
        if (entry.isIntersecting) {
          entry.target.classList.add('animate-in', 'fade-in', 'slide-in-from-bottom-2')
          entry.target.classList.remove('opacity-0', 'translate-y-4')
          io.unobserve(entry.target)
        }
      })
    }, { rootMargin: '0px 0px -10% 0px', threshold: 0.15, ...(options || {}) })
    el.classList.add('opacity-0', 'translate-y-4')
    io.observe(el)
    return () => io.disconnect()
  }, [options])
  return ref
}

/* Defaults */
const weekdayLabels = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
const defaultAvailability: WeeklyAvailability = {
  slotDurationMinutes: 30,
  days: {
    0: [],
    1: [{ start: '10:00', end: '14:00' }],
    2: [{ start: '10:00', end: '14:00' }],
    3: [{ start: '10:00', end: '14:00' }],
    4: [{ start: '10:00', end: '14:00' }],
    5: [{ start: '10:00', end: '12:00' }],
    6: [],
  } as Record<DayOfWeek, TimeRange[]>,
}

export default function Page() {
  const { toast } = useToast()

  const [professionals, setProfessionals] = useLocalStorage<Professional[]>('pros', [])
  const [clients, setClients] = useLocalStorage<Client[]>('clients', [])
  const [appointments, setAppointments] = useLocalStorage<Appointment[]>('appts', [])
  const [notifications, setNotifications] = useLocalStorage<InAppNotification[]>('notifications', [])
  const [currentClientId, setCurrentClientId] = useLocalStorage<string | null>('currentClientId', null)
  const [currentProId, setCurrentProId] = useLocalStorage<string | null>('currentProId', null)
  const [query, setQuery] = useState('')
  const [loadingPros, setLoadingPros] = useState(true)

  useEffect(() => {
    if (professionals.length === 0) {
      const seed: Professional[] = [
        {
          id: uid('pro'),
          name: 'Dr. Aasha Koirala',
          specialty: 'Therapist',
          feeCoins: 300,
          methods: ['chat', 'audio', 'video'],
          bio: 'Mental wellness specialist with 8+ years of experience.',
          avatar: '/therapist-portrait.png',
          availability: defaultAvailability,
          rating: 4.9,
          reviews: 142,
        },
        {
          id: uid('pro'),
          name: 'Bikash Thapa',
          specialty: 'Fitness Coach',
          feeCoins: 180,
          methods: ['audio', 'video'],
          bio: 'Certified trainer helping people build sustainable habits.',
          avatar: '/coach-portrait.png',
          availability: defaultAvailability,
          rating: 4.7,
          reviews: 98,
        },
        {
          id: uid('pro'),
          name: 'Adv. Sita Sharma',
          specialty: 'Lawyer',
          feeCoins: 500,
          methods: ['chat', 'audio', 'video'],
          bio: 'Legal counsel for family and property cases.',
          avatar: '/lawyer-portrait.png',
          availability: defaultAvailability,
          rating: 4.8,
          reviews: 76,
        },
      ]
      setProfessionals(seed)
    }
    if (clients.length === 0) {
      const demo: Client = { id: uid('cl'), name: 'Demo Client', coins: 1000 }
      setClients([demo])
      setCurrentClientId(demo.id)
    }
    const t = setTimeout(() => setLoadingPros(false), 600)
    return () => clearTimeout(t)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const currentClient = useMemo(() => clients.find(c => c.id === currentClientId) || null, [clients, currentClientId])
  const currentPro = useMemo(() => professionals.find(p => p.id === currentProId) || null, [professionals, currentProId])
  const unreadCount = notifications.filter(n => !n.read).length
  const addNotification = (title: string, body: string) => {
    setNotifications(prev => [{ id: uid('ntf'), title, body, createdAt: Date.now(), read: false }, ...prev])
  }
  const markAllRead = () => setNotifications(prev => prev.map(n => ({ ...n, read: true })))

  // Browser notifications + SW
  const [notifPerm, setNotifPerm] = useState<NotificationPermission>('default')
  useEffect(() => {
    if (typeof Notification !== 'undefined') setNotifPerm(Notification.permission)
    if ('serviceWorker' in navigator) navigator.serviceWorker.register('/sw.js', { scope: '/' }).catch(() => {})
  }, [])
  const requestBrowserNotifications = async () => {
    if (typeof Notification === 'undefined') return
    const res = await Notification.requestPermission()
    setNotifPerm(res)
    if (res !== 'granted') toast({ title: 'Permission not granted', description: 'We could not enable browser notifications.' })
    else toast({ title: 'Notifications enabled', description: 'You will receive booking and reminder alerts.' })
  }
  const showBrowserNotification = async (title: string, options?: NotificationOptions) => {
    try {
      if (notifPerm !== 'granted') return
      if ('serviceWorker' in navigator) {
        const reg = await navigator.serviceWorker.getRegistration()
        if (reg) { await reg.showNotification(title, options); return }
      }
      new Notification(title, options)
    } catch {}
  }

  // Wallet
  const addCoins = (clientId: string, amount: number) => setClients(prev => prev.map(c => (c.id === clientId ? { ...c, coins: c.coins + amount } : c)))
  const deductCoins = (clientId: string, amount: number) => setClients(prev => prev.map(c => (c.id === clientId ? { ...c, coins: c.coins - amount } : c)))

  // Register
  const handleProRegister = (p: Omit<Professional, 'id'>) => {
    const newPro: Professional = { ...p, id: uid('pro') }
    setProfessionals(prev => [newPro, ...prev])
    setCurrentProId(newPro.id)
    addNotification('Welcome, Professional!', `Your profile "${newPro.name}" is live.`)
    toast({ title: 'Professional profile created', description: `${newPro.name} is now discoverable.` })
  }
  const handleClientRegister = (name: string) => {
    const newClient: Client = { id: uid('cl'), name, coins: 0 }
    setClients(prev => [newClient, ...prev])
    setCurrentClientId(newClient.id)
    addNotification('Welcome!', `Account created for ${newClient.name}.`)
    toast({ title: 'Client created', description: `Signed in as ${newClient.name}.` })
  }

  // Booking & reminders
  const [buyOpen, setBuyOpen] = useState(false)
  const [buyAmount, setBuyAmount] = useState(200)
  const [buyMethod, setBuyMethod] = useState<'esewa' | 'paypal' | 'stripe'>('esewa')
  const [bookingOpen, setBookingOpen] = useState(false)
  const [bookingPro, setBookingPro] = useState<Professional | null>(null)
  const openBooking = (pro: Professional) => { setBookingPro(pro); setBookingOpen(true) }

  const createAppointment = (client: Client, pro: Professional, start: Date, durationMinutes: number, method: CommMethod) => {
    const appt: Appointment = { id: uid('apt'), proId: pro.id, clientId: client.id, startISO: start.toISOString(), durationMinutes, method, status: 'scheduled' }
    setAppointments(prev => [appt, ...prev])
    addNotification('Appointment booked', `Booked ${method} session with ${pro.name} for ${humanDateTime(start)}.`)
    showBrowserNotification('Appointment booked', { body: `${pro.name} • ${humanDateTime(start)}`, icon: '/appointment-booked-icon.png' })
    scheduleReminders(appt)
    return appt
  }

  const reminderTimers = useRef<Record<string, number[]>>({})
  const proName = (id: string) => professionals.find(p => p.id === id)?.name || 'Professional'
  const clientName = (id: string) => clients.find(c => c.id === id)?.name || 'Client'
  const [sessionOpen, setSessionOpen] = useState(false)
  const [activeSession, setActiveSession] = useState<Appointment | null>(null)
  const scheduleReminders = (appt: Appointment, reminderMinutes = 5) => {
    const start = new Date(appt.startISO)
    const now = new Date()
    const msUntilReminder = start.getTime() - now.getTime() - reminderMinutes * 60_000
    const msUntilStart = start.getTime() - now.getTime()
    const timers: number[] = []
    if (msUntilReminder > 0) {
      const t1 = window.setTimeout(() => {
        addNotification('Appointment reminder', `Reminder: Your ${appt.method} session with ${proName(appt.proId)} starts in ${reminderMinutes} minutes.`)
        showBrowserNotification('Appointment reminder', { body: `Starts in ${reminderMinutes} minutes`, icon: '/appointment-reminder-icon.png' })
      }, msUntilReminder)
      timers.push(t1)
    }
    if (msUntilStart > 0) {
      const t2 = window.setTimeout(() => {
        addNotification('Appointment starting', `Your ${appt.method} session with ${proName(appt.proId)} is starting now.`)
        showBrowserNotification('Appointment starting', { body: 'Tap to join', icon: '/appointment-start-icon.png' })
        setActiveSession(appt)
        setSessionOpen(true)
      }, msUntilStart)
      timers.push(t2)
    }
    reminderTimers.current[appt.id] = timers
  }

  const filteredPros = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return professionals
    return professionals.filter(p => p.name.toLowerCase().includes(q) || p.specialty.toLowerCase().includes(q))
  }, [query, professionals])

  const heroRef = useInViewAnimation<HTMLDivElement>()
  const howRef = useInViewAnimation<HTMLDivElement>()
  const prosRef = useInViewAnimation<HTMLDivElement>()
  const pricingRef = useInViewAnimation<HTMLDivElement>()
  const faqRef = useInViewAnimation<HTMLDivElement>()
  const testiRef = useInViewAnimation<HTMLDivElement>()
  const registerRef = useInViewAnimation<HTMLDivElement>()

  const scrollToId = (id: string) => { const el = document.getElementById(id); if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' }) }

  return (
    <div className="relative min-h-screen">
      {/* Global background: gradient + subtle noise image */}
      <div className="pointer-events-none fixed inset-0 -z-10">
        <div className="absolute inset-0 bg-gradient-to-b from-emerald-50 to-white dark:from-slate-950 dark:to-slate-900" />
        <div className="absolute inset-0 opacity-[0.04] dark:opacity-[0.06] bg-[url('/bg-noise.png')] bg-repeat" />
        {/* Decorative radial glow */}
        <div className="absolute -top-24 left-1/2 h-[480px] w-[480px] -translate-x-1/2 rounded-full bg-emerald-400/20 blur-3xl dark:bg-emerald-500/10" />
      </div>

      {/* Navbar */}
      <header className="sticky top-0 z-20 bg-white/70 dark:bg-slate-950/60 backdrop-blur border-b border-emerald-100/60 dark:border-white/10">
        <div className="container mx-auto px-4 py-3 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Logo />
            <nav className="hidden md:flex items-center gap-4 text-sm">
              <a className="hover:text-emerald-700 dark:hover:text-emerald-400 cursor-pointer transition-colors" onClick={() => scrollToId('how')}>How it works</a>
              <a className="hover:text-emerald-700 dark:hover:text-emerald-400 cursor-pointer transition-colors" onClick={() => scrollToId('pros')}>Professionals</a>
              <a className="hover:text-emerald-700 dark:hover:text-emerald-400 cursor-pointer transition-colors" onClick={() => scrollToId('pricing')}>Coins</a>
              <a className="hover:text-emerald-700 dark:hover:text-emerald-400 cursor-pointer transition-colors" onClick={() => scrollToId('faq')}>FAQs</a>
              <a className="hover:text-emerald-700 dark:hover:text-emerald-400 cursor-pointer transition-colors" onClick={() => scrollToId('testimonials')}>Testimonials</a>
            </nav>
          </div>
          <div className="flex items-center gap-2">
            <ThemeToggle />
            <Wallet client={currentClient} onBuyClick={() => setBuyOpen(true)} />
            <NotificationBell unread={unreadCount} items={notifications} onOpen={() => markAllRead()} />
            <Button className="bg-emerald-600 hover:bg-emerald-700 text-white transition-colors" onClick={() => scrollToId('register')}>
              Login / Register
            </Button>
          </div>
        </div>
      </header>

      <main>
        {/* Hero */}
        <section id="hero" ref={heroRef} className="container mx-auto px-4 pt-12 md:pt-16">
          <div className="grid lg:grid-cols-2 gap-8 items-center">
            <div>
              <h1 className="text-3xl md:text-5xl font-extrabold tracking-tight">
                Book trusted professionals — all from one landing page
              </h1>
              <p className="mt-3 text-muted-foreground max-w-prose">
                Set weekly availability, buy coins, and book chat, audio, or video sessions. Simple, fast, and secure.
              </p>
              <div className="mt-6 flex flex-wrap gap-3">
                <Button size="lg" className="bg-emerald-600 hover:bg-emerald-700 text-white transition-colors" onClick={() => scrollToId('register')}>
                  Get started <ArrowRight className="h-4 w-4 ml-2" />
                </Button>
                <Button size="lg" variant="outline" className="transition-colors" onClick={() => scrollToId('pros')}>
                  Explore professionals
                </Button>
                {notifPerm !== 'granted' && (
                  <Button size="lg" variant="secondary" className="transition-colors" onClick={requestBrowserNotifications}>
                    <BellRing className="h-4 w-4 mr-2" /> Enable notifications
                  </Button>
                )}
              </div>
              <div className="mt-6 flex items-center gap-4 text-sm">
                <div className="flex items-center gap-1 text-amber-500">
                  <Star className="h-4 w-4 fill-amber-500" /><Star className="h-4 w-4 fill-amber-500" /><Star className="h-4 w-4 fill-amber-500" /><Star className="h-4 w-4 fill-amber-500" /><Star className="h-4 w-4 fill-amber-500" />
                </div>
                <div className="text-muted-foreground">Loved by clients and professionals</div>
              </div>
            </div>
            <div aria-hidden className="relative">
              <img
                src="/appointment-booking-illustration.png"
                alt="Booking illustration"
                className="w-full rounded-xl shadow-lg ring-1 ring-black/5 transition-transform duration-500 hover:-translate-y-1"
              />
              <div className="absolute -bottom-4 -left-4 hidden md:block">
                <Card className="bg-white/90 dark:bg-slate-900/80 backdrop-blur transition-all duration-300 hover:shadow-lg">
                  <CardContent className="p-3 flex items-center gap-3">
                    <div className="rounded-md bg-emerald-50 dark:bg-emerald-500/10 p-2">
                      <CalendarClock className="h-4 w-4 text-emerald-700 dark:text-emerald-400" />
                    </div>
                    <div className="text-sm">
                      <div className="font-medium">Smart reminders</div>
                      <div className="text-xs text-muted-foreground">Push + in-app before sessions</div>
                    </div>
                  </CardContent>
                </Card>
              </div>
            </div>
          </div>
          <div className="mt-8 grid sm:grid-cols-3 gap-4">
            <Stat title="Professionals" value={String(professionals.length)} />
            <Stat title="Coins purchased (demo)" value={`${currentClient?.coins ?? 0}`} />
            <Stat title="Appointments (demo)" value={`${appointments.length}`} />
          </div>
          <div className="mt-4 text-xs text-muted-foreground">
            Note: For production Web Push, add VAPID keys and server actions to manage subscriptions and send notifications.
          </div>
        </section>

        {/* How it works */}
        <section id="how" ref={howRef} className="container mx-auto px-4 py-16">
          <div className="text-center mb-8">
            <h2 className="text-2xl md:text-3xl font-bold">How it works</h2>
            <p className="text-muted-foreground">From registration to your session in a few simple steps</p>
          </div>
          <div className="grid md:grid-cols-3 gap-4">
            <Step icon={User} title="Register" text="Sign up as a client or professional. No dashboard to learn." />
            <Step icon={Clock} title="Set availability" text="Pros set weekly time ranges once; slots repeat weekly." />
            <Step icon={Coins} title="Buy coins" text="1 coin = 1 NPR. Pay via eSewa, PayPal, or Stripe." />
          </div>
          <div className="mt-4 grid md:grid-cols-3 gap-4">
            <Step icon={CalendarClock} title="Book a slot" text="Pick a date/time and communication method." />
            <Step icon={Bell} title="Get notified" text="Immediate confirmation + reminder before start." />
            <Step icon={Video} title="Start session" text="Chat, audio, or video when time begins." />
          </div>
        </section>

        {/* Register */}
        <section id="register" ref={registerRef} className="container mx-auto px-4 py-12">
          <Card className="bg-white/80 dark:bg-slate-900/70 shadow-sm transition-all duration-300 hover:shadow-md">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <ShieldCheck className="h-5 w-5 text-emerald-600 dark:text-emerald-400" />
                Register & get booked
              </CardTitle>
              <CardDescription>Everything lives here on the landing page.</CardDescription>
            </CardHeader>
            <CardContent>
              <Tabs defaultValue="client" className="w-full">
                <TabsList className="grid grid-cols-2 w-full">
                  <TabsTrigger value="client">I&apos;m a Client</TabsTrigger>
                  <TabsTrigger value="pro">I&apos;m a Professional</TabsTrigger>
                </TabsList>
                <TabsContent value="client" className="pt-4">
                  <ClientForm
                    existing={clients}
                    currentClientId={currentClientId}
                    onRegister={handleClientRegister}
                    onSwitch={setCurrentClientId}
                  />
                  <div className="mt-3 flex flex-wrap gap-2">
                    <Button
                      variant="secondary"
                      className="transition-colors"
                      onClick={() => {
                        const demo = clients.find(c => c.name === 'Demo Client')
                        if (demo) { setCurrentClientId(demo.id); toast({ title: 'Signed in as Demo Client' }) }
                        else {
                          const d: Client = { id: uid('cl'), name: 'Demo Client', coins: 1000 }
                          setClients(prev => [d, ...prev]); setCurrentClientId(d.id); toast({ title: 'Demo Client created' })
                        }
                      }}
                    >
                      <Play className="h-4 w-4 mr-2" /> Demo client login
                    </Button>
                  </div>
                </TabsContent>
                <TabsContent value="pro" className="pt-4">
                  <ProfessionalForm onRegister={handleProRegister} />
                  <div className="mt-3">
                    <Button
                      variant="secondary"
                      className="transition-colors"
                      onClick={() => {
                        const pro = professionals[0]
                        if (pro) { setCurrentProId(pro.id); toast({ title: `Signed in as ${pro.name}` }) }
                        else { toast({ title: 'No professionals available', description: 'Create a professional profile first.' }) }
                      }}
                    >
                      <Play className="h-4 w-4 mr-2" /> Demo pro login
                    </Button>
                  </div>
                </TabsContent>
              </Tabs>
            </CardContent>
          </Card>
        </section>

        {/* Popular professionals */}
        <section id="pros" ref={prosRef} className="container mx-auto px-4 py-12">
          <div className="flex items-center justify-between mb-6">
            <div>
              <h2 className="text-2xl md:text-3xl font-bold">Popular professionals</h2>
              <p className="text-muted-foreground">Explore profiles and real-time availability</p>
            </div>
            <div className="relative hidden md:block">
              <Input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search by name or specialty..."
                className="pl-9 w-[300px] transition-all"
                aria-label="Search professionals"
              />
              <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            </div>
          </div>
          <div className="md:hidden mb-3">
            <Input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search by name or specialty..."
              className="pl-9 transition-all"
              aria-label="Search professionals"
            />
          </div>

          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {loadingPros &&
              Array.from({ length: 6 }).map((_, i) => (
                <Card key={i} className="transition-all duration-300 hover:shadow-lg hover:-translate-y-0.5">
                  <CardContent className="p-4">
                    <div className="flex items-center gap-3">
                      <Skeleton className="h-12 w-12 rounded-full" />
                      <div className="flex-1">
                        <Skeleton className="h-4 w-2/3" />
                        <Skeleton className="h-3 w-1/3 mt-2" />
                      </div>
                    </div>
                    <Skeleton className="h-3 w-full mt-3" />
                    <Skeleton className="h-8 w-1/2 mt-3" />
                  </CardContent>
                </Card>
              ))
            }
            {!loadingPros && filteredPros.length === 0 && (
              <div className="col-span-full text-sm text-muted-foreground">No professionals found.</div>
            )}
            {!loadingPros && filteredPros.map((pro) => {
              const nextSlots = nextThreeSlots(pro, appointments)
              return (
                <Card key={pro.id} className="transition-all duration-300 hover:shadow-lg hover:-translate-y-0.5">
                  <CardContent className="p-4">
                    <div className="flex items-center gap-3">
                      <img
                        src={pro.avatar || '/placeholder.svg?height=120&width=120&query=professional%20portrait'}
                        alt={`${pro.name} avatar`}
                        className="h-12 w-12 rounded-full object-cover ring-1 ring-black/5"
                      />
                      <div className="flex-1">
                        <div className="font-medium">{pro.name}</div>
                        <div className="text-xs text-muted-foreground">{pro.specialty}</div>
                        {pro.rating && (
                          <div className="mt-1 flex items-center gap-1 text-xs text-amber-600">
                            <Star className="h-4 w-4 fill-amber-500 text-amber-500" />
                            <span className="font-medium">{pro.rating.toFixed(1)}</span>
                            <span className="text-muted-foreground">({pro.reviews})</span>
                          </div>
                        )}
                      </div>
                      <Badge variant="outline">{pro.feeCoins} coins</Badge>
                    </div>
                    {pro.bio && <p className="text-sm text-muted-foreground mt-2 line-clamp-2">{pro.bio}</p>}
                    <div className="mt-3 flex items-center gap-1 text-xs text-muted-foreground">
                      {pro.methods.includes('chat') && <MessageSquare className="h-4 w-4" />}
                      {pro.methods.includes('audio') && <Mic className="h-4 w-4" />}
                      {pro.methods.includes('video') && <Video className="h-4 w-4" />}
                    </div>
                    <div className="mt-3">
                      <div className="text-xs text-muted-foreground mb-1">Upcoming slots (next 7 days)</div>
                      <div className="flex flex-wrap gap-2">
                        {nextSlots.length === 0 ? (
                          <span className="text-xs text-muted-foreground">No slots available</span>
                        ) : nextSlots.map(s => (
                          <Badge key={s.toISOString()} variant="secondary">{humanDateTime(s)}</Badge>
                        ))}
                      </div>
                    </div>
                    <div className="mt-4">
                      <Button
                        className="w-full bg-emerald-600 hover:bg-emerald-700 text-white transition-colors"
                        onClick={() => openBooking(pro)}
                        disabled={!currentClient}
                      >
                        Book {pro.specialty} <ChevronRight className="h-4 w-4 ml-1" />
                      </Button>
                      {!currentClient && (
                        <div className="text-xs text-muted-foreground text-center mt-1">
                          Sign up as Client to book
                        </div>
                      )}
                    </div>
                  </CardContent>
                </Card>
              )
            })}
          </div>
        </section>

        {/* Pricing / Coins */}
        <section id="pricing" ref={pricingRef} className="container mx-auto px-4 py-12">
          <div className="text-center mb-8">
            <h2 className="text-2xl md:text-3xl font-bold">Coins wallet</h2>
            <p className="text-muted-foreground">1 coin = 1 NPR. Use coins to book appointments.</p>
          </div>
          <div className="grid md:grid-cols-3 gap-4">
            <CoinPlan name="Starter" coins={200} description="Try your first session" highlight={false} onBuy={() => setBuyAmount(200)} />
            <CoinPlan name="Popular" coins={500} description="Multiple short sessions" highlight onBuy={() => setBuyAmount(500)} />
            <CoinPlan name="Pro" coins={1000} description="Longer or more frequent sessions" highlight={false} onBuy={() => setBuyAmount(1000)} />
          </div>
          <div className="text-center mt-6">
            <Button size="lg" className="bg-emerald-600 hover:bg-emerald-700 text-white transition-colors" onClick={() => setBuyOpen(true)}>
              <Coins className="h-4 w-4 mr-2" /> Buy coins
            </Button>
          </div>
        </section>

        {/* FAQs */}
        <section id="faq" ref={faqRef} className="container mx-auto px-4 py-12">
          <div className="text-center mb-6">
            <h2 className="text-2xl md:text-3xl font-bold">Frequently asked questions</h2>
          </div>
          <div className="max-w-2xl mx-auto">
            <Accordion type="single" collapsible>
              <AccordionItem value="item-1">
                <AccordionTrigger>How do notifications work?</AccordionTrigger>
                <AccordionContent>
                  You get in-app notifications for bookings and reminders. You can also enable browser notifications for alerts.
                </AccordionContent>
              </AccordionItem>
              <AccordionItem value="item-2">
                <AccordionTrigger>Can I change my weekly availability?</AccordionTrigger>
                <AccordionContent>
                  Yes. Update time ranges in your professional profile — they repeat weekly and slots update instantly.
                </AccordionContent>
              </AccordionItem>
              <AccordionItem value="item-3">
                <AccordionTrigger>What payment methods are supported?</AccordionTrigger>
                <AccordionContent>
                  eSewa, PayPal, and Stripe are supported. In this demo, payments are simulated; integrate real gateways to credit coins on successful webhooks.
                </AccordionContent>
              </AccordionItem>
            </Accordion>
          </div>
        </section>

        {/* Testimonials */}
        <section id="testimonials" ref={testiRef} className="container mx-auto px-4 py-12">
          <div className="text-center mb-6">
            <h2 className="text-2xl md:text-3xl font-bold">What our users say</h2>
          </div>
          <div className="grid md:grid-cols-3 gap-4">
            <Testimonial name="Ravi" text="Booking a coach was effortless. Reminders kept me on track." />
            <Testimonial name="Sneha" text="Loved the simple flow — everything on one page!" />
            <Testimonial name="Kamal" text="Chat and video sessions are smooth for my consultations." />
          </div>
        </section>
      </main>

      {/* Footer */}
      <footer className="border-t bg-white/70 dark:bg-slate-950/60 backdrop-blur">
        <div className="container mx-auto px-4 py-8 grid md:grid-cols-4 gap-6">
          <div>
            <Logo />
            <p className="text-sm text-muted-foreground mt-2">
              Book trusted professionals with ease.
            </p>
            <div className="mt-3 flex items-center gap-2">
              <Social icon={Facebook} />
              <Social icon={Instagram} />
              <Social icon={Linkedin} />
              <Social icon={Github} />
            </div>
          </div>
          <div>
            <div className="font-medium mb-2">Links</div>
            <ul className="space-y-1 text-sm">
              <li><a className="hover:text-emerald-700 dark:hover:text-emerald-400 cursor-pointer" onClick={() => scrollToId('how')}>How it works</a></li>
              <li><a className="hover:text-emerald-700 dark:hover:text-emerald-400 cursor-pointer" onClick={() => scrollToId('pros')}>Professionals</a></li>
              <li><a className="hover:text-emerald-700 dark:hover:text-emerald-400 cursor-pointer" onClick={() => scrollToId('pricing')}>Coins</a></li>
              <li><a className="hover:text-emerald-700 dark:hover:text-emerald-400 cursor-pointer" onClick={() => scrollToId('faq')}>FAQs</a></li>
            </ul>
          </div>
          <div>
            <div className="font-medium mb-2">Support</div>
            <ul className="space-y-1 text-sm">
              <li>help@aptly.app</li>
              <li>+977-1-555-0000</li>
              <li>Kathmandu, Nepal</li>
            </ul>
          </div>
          <div>
            <div className="font-medium mb-2">Newsletter</div>
            <div className="flex gap-2">
              <Input placeholder="Your email" />
              <Button className="bg-emerald-600 hover:bg-emerald-700 text-white transition-colors"><Mail className="h-4 w-4" /></Button>
            </div>
            <p className="text-xs text-muted-foreground mt-2">Stay informed about new features</p>
          </div>
        </div>
        <div className="container mx-auto px-4 pb-6 text-xs text-muted-foreground">
          © {new Date().getFullYear()} Aptly — All rights reserved.
        </div>
      </footer>

      {/* Buy Coins Dialog */}
      <Dialog open={buyOpen} onOpenChange={setBuyOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Buy coins</DialogTitle>
            <DialogDescription>1 coin = 1 NPR. Choose provider and amount.</DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div className="grid grid-cols-3 gap-2">
              <Button variant={buyMethod === 'esewa' ? 'default' : 'outline'} className={cn(buyMethod === 'esewa' && 'bg-emerald-600 hover:bg-emerald-700 text-white transition-colors')} onClick={() => setBuyMethod('esewa')}>eSewa</Button>
              <Button variant={buyMethod === 'paypal' ? 'default' : 'outline'} className={cn(buyMethod === 'paypal' && 'bg-emerald-600 hover:bg-emerald-700 text-white transition-colors')} onClick={() => setBuyMethod('paypal')}>PayPal</Button>
              <Button variant={buyMethod === 'stripe' ? 'default' : 'outline'} className={cn(buyMethod === 'stripe' && 'bg-emerald-600 hover:bg-emerald-700 text-white transition-colors')} onClick={() => setBuyMethod('stripe')}>Stripe</Button>
            </div>
            <div className="grid grid-cols-[1fr_auto] items-center gap-2">
              <div>
                <Label htmlFor="amount">Amount (NPR)</Label>
                <Input id="amount" type="number" min={10} step={10} value={buyAmount} onChange={(e) => setBuyAmount(Number(e.target.value || 0))} />
              </div>
              <div className="text-center">
                <div className="text-xs text-muted-foreground">Coins you get</div>
                <div className="font-semibold">{buyAmount}</div>
              </div>
            </div>
          </div>
          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => setBuyOpen(false)}>Cancel</Button>
            <Button
              className="bg-emerald-600 hover:bg-emerald-700 text-white transition-colors"
              onClick={async () => {
                if (!currentClient) { toast({ title: 'Sign in as Client to buy coins' }); return }
                const p = new Promise(res => setTimeout(res, 800))
                toast({ title: 'Processing payment...', description: `Paying ${buyAmount} NPR via ${buyMethod}` })
                await p
                addCoins(currentClient.id, buyAmount)
                addNotification('Coins added', `Purchased ${buyAmount} coins via ${buyMethod}.`)
                toast({ title: 'Coins added', description: `Your wallet has been credited.` })
                setBuyOpen(false)
              }}
              disabled={!currentClient || buyAmount <= 0}
            >
              Pay {buyAmount} NPR
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Booking Dialog */}
      {bookingPro && currentClient && (
        <BookDialog
          open={bookingOpen}
          onOpenChange={setBookingOpen}
          pro={bookingPro}
          client={currentClient}
          appointments={appointments}
          onInsufficientFunds={() => { setBuyOpen(true); toast({ title: 'Insufficient coins', description: 'Please buy more coins to book this appointment.' }) }}
          onCreate={(client, pro, start, duration, method) => { const appt = createAppointment(client, pro, start, duration, method); deductCoins(client.id, pro.feeCoins); return appt }}
          onBooked={() => setBookingOpen(false)}
        />
      )}

      {/* Session Modal */}
      {activeSession && (
        <SessionModal
          open={sessionOpen}
          onOpenChange={setSessionOpen}
          appt={activeSession}
          proName={proName(activeSession.proId)}
          clientName={clientName(activeSession.clientId)}
        />
      )}
    </div>
  )
}

/* UI Pieces */

function Logo() {
  return (
    <div className="flex items-center gap-2">
      <CalendarClock className="h-6 w-6 text-emerald-600 dark:text-emerald-400" />
      <span className="font-semibold">Aptly</span>
    </div>
  )
}
function Stat({ title, value }: { title: string; value: string }) {
  return (
    <Card className="bg-white/80 dark:bg-slate-900/70 transition-all duration-300 hover:shadow-md">
      <CardContent className="p-4">
        <div className="text-xs text-muted-foreground">{title}</div>
        <div className="text-2xl font-bold">{value}</div>
      </CardContent>
    </Card>
  )
}
function Step({ icon: Icon, title, text }: { icon: LucideIcon; title: string; text: string }) {
  return (
    <Card className="bg-white/80 dark:bg-slate-900/70 transition-all duration-300 hover:shadow-md hover:-translate-y-0.5">
      <CardContent className="p-4">
        <div className="flex items-center gap-2">
          <div className="rounded-md bg-emerald-50 dark:bg-emerald-500/10 p-2">
            <Icon className="h-4 w-4 text-emerald-700 dark:text-emerald-400" />
          </div>
          <div className="font-medium">{title}</div>
        </div>
        <p className="text-sm text-muted-foreground mt-2">{text}</p>
      </CardContent>
    </Card>
  )
}
function CoinPlan({ name, coins, description, highlight, onBuy }: { name: string; coins: number; description: string; highlight?: boolean; onBuy: () => void }) {
  return (
    <Card className={cn('bg-white/80 dark:bg-slate-900/70 relative transition-all duration-300 hover:shadow-lg hover:-translate-y-0.5', highlight && 'ring-2 ring-emerald-600')}>
      {highlight && <div className="absolute -top-3 right-3 rounded-full bg-emerald-600 text-white text-xs px-2 py-0.5">Best value</div>}
      <CardHeader>
        <CardTitle>{name}</CardTitle>
        <CardDescription>{description}</CardDescription>
      </CardHeader>
      <CardContent>
        <div className="text-3xl font-bold">{coins}<span className="text-lg font-normal text-muted-foreground"> coins</span></div>
        <ul className="mt-3 text-sm space-y-1">
          <li className="flex items-center gap-2"><Check className="h-4 w-4 text-emerald-600 dark:text-emerald-400" /> 1 coin = 1 NPR</li>
          <li className="flex items-center gap-2"><Check className="h-4 w-4 text-emerald-600 dark:text-emerald-400" /> No expiry</li>
          <li className="flex items-center gap-2"><Check className="h-4 w-4 text-emerald-600 dark:text-emerald-400" /> Book any pro</li>
        </ul>
        <Button className="mt-4 w-full bg-emerald-600 hover:bg-emerald-700 text-white transition-colors" onClick={onBuy}>Select</Button>
      </CardContent>
    </Card>
  )
}
function Social({ icon: Icon }: { icon: LucideIcon }) {
  return (
    <Button variant="outline" size="icon" className="rounded-full transition-colors">
      <Icon className="h-4 w-4" />
      <span className="sr-only">Social</span>
    </Button>
  )
}
function Testimonial({ name, text }: { name: string; text: string }) {
  return (
    <Card className="bg-white/80 dark:bg-slate-900/70 transition-all duration-300 hover:shadow-md hover:-translate-y-0.5">
      <CardContent className="p-4">
        <div className="flex items-center gap-2">
          <img src="/diverse-user-avatars.png" alt="" className="h-10 w-10 rounded-full object-cover ring-1 ring-black/5" />
          <div>
            <div className="font-medium">{name}</div>
            <div className="flex items-center gap-0.5 text-amber-500">
              <Star className="h-4 w-4 fill-amber-500" /><Star className="h-4 w-4 fill-amber-500" /><Star className="h-4 w-4 fill-amber-500" /><Star className="h-4 w-4 fill-amber-500" /><Star className="h-4 w-4 fill-amber-500" />
            </div>
          </div>
        </div>
        <p className="mt-2 text-sm text-muted-foreground">{text}</p>
      </CardContent>
    </Card>
  )
}
function Wallet({ client, onBuyClick }: { client: Client | null; onBuyClick: () => void }) {
  return (
    <div className="flex items-center gap-2">
      <div className={cn('flex items-center gap-1 rounded-full border px-3 py-1 transition-all', !client && 'opacity-50')}>
        <Coins className="h-4 w-4 text-emerald-600 dark:text-emerald-400" />
        <span className="text-sm font-medium">{client ? client.coins : 0}</span>
      </div>
      <Button size="sm" variant="outline" className="transition-colors" onClick={onBuyClick} disabled={!client}>Buy Coins</Button>
    </div>
  )
}
function NotificationBell({
  unread, items, onOpen,
}: { unread: number; items: InAppNotification[]; onOpen: () => void }) {
  const [open, setOpen] = useState(false)
  return (
    <Dialog open={open} onOpenChange={(v) => { setOpen(v); if (v) onOpen() }}>
      <DialogTrigger asChild>
        <Button variant="ghost" size="icon" aria-label="Open notifications" className="relative transition-colors">
          <Bell className="h-5 w-5" />
          {unread > 0 && (
            <span className="absolute -top-1 -right-1 inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-emerald-600 px-1 text-[10px] font-semibold text-white">
              {unread}
            </span>
          )}
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Notifications</DialogTitle>
          <DialogDescription>In-app updates about your bookings.</DialogDescription>
        </DialogHeader>
        <div className="max-h-[60vh] overflow-auto space-y-2">
          {items.length === 0 && <div className="text-sm text-muted-foreground">No notifications yet.</div>}
          {items.map(n => (
            <div key={n.id} className="rounded-md border p-2 transition-colors">
              <div className="text-sm font-medium">{n.title}</div>
              <div className="text-xs text-muted-foreground">{n.body}</div>
              <div className="text-[10px] text-muted-foreground mt-1">{new Date(n.createdAt).toLocaleString()}</div>
            </div>
          ))}
        </div>
      </DialogContent>
    </Dialog>
  )
}
function ClientForm({
  existing, currentClientId, onRegister, onSwitch,
}: { existing: Client[]; currentClientId: string | null; onRegister: (name: string) => void; onSwitch: (id: string | null) => void }) {
  const [name, setName] = useState('')
  return (
    <div className="space-y-4">
      <div className="grid sm:grid-cols-[1fr_auto] gap-2">
        <div>
          <Label htmlFor="client-name">Your name</Label>
          <Input id="client-name" value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Sita Shrestha" />
        </div>
        <Button
          className="sm:self-end bg-emerald-600 hover:bg-emerald-700 text-white transition-colors"
          onClick={() => { if (!name.trim()) return; onRegister(name.trim()); setName('') }}
        >
          <User className="h-4 w-4 mr-1" /> Create client
        </Button>
      </div>
      {existing.length > 0 && (
        <div className="grid sm:grid-cols-[1fr_auto] gap-2 items-end">
          <div>
            <Label htmlFor="switch-client">Switch client</Label>
            <Select value={currentClientId ?? ''} onValueChange={(v) => onSwitch(v || null)}>
              <SelectTrigger id="switch-client"><SelectValue placeholder="Select client" /></SelectTrigger>
              <SelectContent>
                {existing.map(c => (<SelectItem key={c.id} value={c.id}>{c.name} ({c.coins} coins)</SelectItem>))}
              </SelectContent>
            </Select>
          </div>
          <Button variant="outline" className="transition-colors" onClick={() => onSwitch(null)}>Sign out</Button>
        </div>
      )}
    </div>
  )
}
function AvailabilityEditor({ value, onChange }: { value: WeeklyAvailability; onChange: (v: WeeklyAvailability) => void }) {
  const setSlot = (minutes: number) => onChange({ ...value, slotDurationMinutes: minutes })
  const addRange = (day: DayOfWeek) => {
    const list = value.days[day] || []
    const next: TimeRange = { start: '10:00', end: '12:00' }
    onChange({ ...value, days: { ...value.days, [day]: [...list, next] } })
  }
  const updateRange = (day: DayOfWeek, idx: number, patch: Partial<TimeRange>) => {
    const list = value.days[day] || []
    const next = list.map((r, i) => (i === idx ? { ...r, ...patch } : r))
    onChange({ ...value, days: { ...value.days, [day]: next } })
  }
  const removeRange = (day: DayOfWeek, idx: number) => {
    const list = value.days[day] || []
    const next = list.filter((_, i) => i !== idx)
    onChange({ ...value, days: { ...value.days, [day]: next } })
  }

  return (
    <div className="rounded-lg border p-3">
      <div className="flex items-center gap-3 mb-3">
        <Label htmlFor="slot-dur">Slot duration</Label>
        <Select value={String(value.slotDurationMinutes)} onValueChange={(v) => setSlot(Number(v))}>
          <SelectTrigger id="slot-dur" className="w-[140px]"><SelectValue /></SelectTrigger>
          <SelectContent>
            {[15, 20, 30, 45, 60].map(m => (<SelectItem key={m} value={String(m)}>{m} min</SelectItem>))}
          </SelectContent>
        </Select>
      </div>
      <div className="grid md:grid-cols-2 gap-3">
        {weekdayLabels.map((w, idx) => {
          const day = idx as DayOfWeek
          const ranges = value.days[day] || []
          return (
            <div key={day} className="rounded-md border p-2">
              <div className="flex items-center justify-between mb-2">
                <div className="font-medium">{w}</div>
                <Button size="sm" variant="outline" className="transition-colors" onClick={() => addRange(day)}>Add range</Button>
              </div>
              {ranges.length === 0 && <div className="text-xs text-muted-foreground">Not available</div>}
              <div className="space-y-2">
                {ranges.map((r, i) => (
                  <div key={i} className="grid grid-cols-[1fr_1fr_auto] gap-2 items-end">
                    <div>
                      <Label className="text-xs">Start</Label>
                      <Input type="time" value={r.start} onChange={(e) => updateRange(day, i, { start: e.target.value })} />
                    </div>
                    <div>
                      <Label className="text-xs">End</Label>
                      <Input type="time" value={r.end} onChange={(e) => updateRange(day, i, { end: e.target.value })} />
                    </div>
                    <Button variant="ghost" className="transition-colors" onClick={() => removeRange(day, i)}>Remove</Button>
                  </div>
                ))}
              </div>
            </div>
          )
        })}
      </div>
      <div className="mt-3 text-xs text-muted-foreground">
        Weekly schedule repeats every week. Slots are auto-generated within time ranges.
      </div>
    </div>
  )
}
function ProfessionalForm({ onRegister }: { onRegister: (p: Omit<Professional, 'id'>) => void }) {
  const [name, setName] = useState('')
  const [specialty, setSpecialty] = useState('')
  const [fee, setFee] = useState(200)
  const [methods, setMethods] = useState<CommMethod[]>(['chat', 'audio', 'video'])
  const [availability, setAvailability] = useState<WeeklyAvailability>(defaultAvailability)
  const [bio, setBio] = useState('')

  const toggleMethod = (m: CommMethod) => setMethods(prev => prev.includes(m) ? prev.filter(x => x !== m) : [...prev, m])

  return (
    <div className="space-y-4">
      <div className="grid md:grid-cols-3 gap-3">
        <div className="md:col-span-1">
          <Label htmlFor="pro-name">Name</Label>
          <Input id="pro-name" value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Dr. Ram K." />
        </div>
        <div className="md:col-span-1">
          <Label htmlFor="pro-specialty">Field / Specialty</Label>
          <Input id="pro-specialty" value={specialty} onChange={(e) => setSpecialty(e.target.value)} placeholder="e.g. Therapist, Tutor, Lawyer" />
        </div>
        <div className="md:col-span-1">
          <Label htmlFor="pro-fee">Consultation fee (coins)</Label>
          <Input id="pro-fee" type="number" min={0} value={fee} onChange={(e) => setFee(Number(e.target.value || 0))} />
        </div>
      </div>

      <div>
        <Label htmlFor="pro-bio">Short bio</Label>
        <Input id="pro-bio" value={bio} onChange={(e) => setBio(e.target.value)} placeholder="Tell clients about your expertise" />
      </div>

      <div>
        <Label>Communication methods</Label>
        <div className="flex flex-wrap gap-2 mt-1">
          <Button type="button" variant={methods.includes('chat') ? 'default' : 'outline'} className={cn('transition-colors', methods.includes('chat') && 'bg-emerald-600 hover:bg-emerald-700 text-white')} onClick={() => toggleMethod('chat')}>
            <MessageSquare className="h-4 w-4 mr-1" /> Chat
          </Button>
          <Button type="button" variant={methods.includes('audio') ? 'default' : 'outline'} className={cn('transition-colors', methods.includes('audio') && 'bg-emerald-600 hover:bg-emerald-700 text-white')} onClick={() => toggleMethod('audio')}>
            <Mic className="h-4 w-4 mr-1" /> Audio
          </Button>
          <Button type="button" variant={methods.includes('video') ? 'default' : 'outline'} className={cn('transition-colors', methods.includes('video') && 'bg-emerald-600 hover:bg-emerald-700 text-white')} onClick={() => toggleMethod('video')}>
            <Video className="h-4 w-4 mr-1" /> Video
          </Button>
        </div>
      </div>

      <AvailabilityEditor value={availability} onChange={setAvailability} />

      <div className="pt-2">
        <Button
          className="bg-emerald-600 hover:bg-emerald-700 text-white transition-colors"
          onClick={() => {
            if (!name.trim() || !specialty.trim() || methods.length === 0) return
            onRegister({
              name: name.trim(),
              specialty: specialty.trim(),
              feeCoins: fee,
              methods,
              bio: bio.trim(),
              avatar: '/professional-portrait.png',
              availability,
              rating: 4.6,
              reviews: Math.floor(Math.random() * 100) + 10,
            })
            setName(''); setSpecialty(''); setBio('')
          }}
        >
          <CheckCircle2 className="h-4 w-4 mr-1" /> Create professional profile
        </Button>
      </div>
    </div>
  )
}
function nextThreeSlots(pro: Professional, appts: Appointment[]) {
  const now = new Date()
  const next: Date[] = []
  for (let i = 0; i < 7; i++) {
    const d = new Date(now); d.setDate(now.getDate() + i)
    const base = new Date(d.getFullYear(), d.getMonth(), d.getDate())
    const slots = generateSlotsForDay(base, pro.availability)
    for (const s of slots) {
      if (s.start <= now) continue
      const conflict = appts.some(a => a.proId === pro.id && a.status === 'scheduled' && new Date(a.startISO).getTime() === s.start.getTime())
      if (!conflict) { next.push(s.start); if (next.length >= 3) return next }
    }
  }
  return next
}
function BookDialog({
  open, onOpenChange, pro, client, appointments, onInsufficientFunds, onCreate, onBooked,
}: {
  open: boolean; onOpenChange: (v: boolean) => void; pro: Professional; client: Client; appointments: Appointment[];
  onInsufficientFunds: () => void; onCreate: (client: Client, pro: Professional, start: Date, duration: number, method: CommMethod) => Appointment; onBooked: (appt: Appointment) => void
}) {
  const { toast } = useToast()
  const [dateYMD, setDateYMD] = useState(dateToYMD(new Date()))
  const [method, setMethod] = useState<CommMethod>(pro.methods[0] ?? 'chat')
  const [selectedHM, setSelectedHM] = useState<string>('')

  const date = useMemo(() => ymdToDate(dateYMD), [dateYMD])
  const slots = useMemo(() => {
    const raw = generateSlotsForDay(date, pro.availability)
    const now = new Date()
    return raw
      .filter(s => s.start > now)
      .filter(s => !appointments.some(a => a.proId === pro.id && a.status === 'scheduled' && new Date(a.startISO).getTime() === s.start.getTime()))
  }, [date, pro, appointments])

  useEffect(() => setSelectedHM(''), [dateYMD])

  const fee = pro.feeCoins
  const canAfford = client.coins >= fee

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Book {pro.name}</DialogTitle>
          <DialogDescription>{pro.specialty} • {fee} coins • Slot {pro.availability.slotDurationMinutes} min</DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <div className="grid sm:grid-cols-2 gap-3">
            <div>
              <Label htmlFor="date">Date</Label>
              <Input id="date" type="date" value={dateYMD} onChange={(e) => setDateYMD(e.target.value)} />
            </div>
            <div>
              <Label htmlFor="method">Method</Label>
              <Select value={method} onValueChange={(v: CommMethod) => setMethod(v as CommMethod)}>
                <SelectTrigger id="method"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {pro.methods.map(m => (<SelectItem key={m} value={m}><span className="capitalize">{m}</span></SelectItem>))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div>
            <Label>Available times</Label>
            <div className="mt-2 flex flex-wrap gap-2 max-h-[180px] overflow-auto pr-1">
              {slots.length === 0 && <div className="text-sm text-muted-foreground">No slots available for this date.</div>}
              {slots.map(s => {
                const hm = fmtHM(s.start)
                const active = selectedHM === hm
                return (
                  <Button
                    key={hm}
                    type="button"
                    size="sm"
                    variant={active ? 'default' : 'outline'}
                    className={cn('transition-colors', active && 'bg-emerald-600 hover:bg-emerald-700 text-white')}
                    onClick={() => setSelectedHM(hm)}
                  >
                    {hm}
                  </Button>
                )
              })}
            </div>
          </div>

          <div className="rounded-md border p-3 flex items-center justify-between">
            <div className="text-sm">
              <div className="font-medium">Total</div>
              <div className="text-muted-foreground">{fee} coins</div>
            </div>
            <div className="text-right text-sm">
              <div>Wallet: {client.coins} coins</div>
              {!canAfford && <div className="text-red-600">Insufficient balance</div>}
            </div>
          </div>
        </div>
        <DialogFooter className="gap-2">
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          {!canAfford ? (
            <Button className="bg-emerald-600 hover:bg-emerald-700 text-white transition-colors" onClick={() => { onInsufficientFunds() }}>Buy coins</Button>
          ) : (
            <Button
              className="bg-emerald-600 hover:bg-emerald-700 text-white transition-colors"
              disabled={!selectedHM}
              onClick={() => {
                if (!selectedHM) { toast({ title: 'Select a time' }); return }
                const start = setHM(ymdToDate(dateYMD), selectedHM)
                const appt = onCreate(client, pro, start, pro.availability.slotDurationMinutes, method)
                toast({ title: 'Appointment booked', description: `${humanDateTime(start)} with ${pro.name}` })
                onBooked(appt)
              }}
            >
              Confirm booking
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
function SessionModal({
  open, onOpenChange, appt, proName, clientName,
}: { open: boolean; onOpenChange: (v: boolean) => void; appt: Appointment; proName: string; clientName: string }) {
  const methodIcon = appt.method === 'chat' ? <MessageSquare className="h-4 w-4" /> :
    appt.method === 'audio' ? <Mic className="h-4 w-4" /> : <Video className="h-4 w-4" />

  const [chatLog, setChatLog] = useState<{ who: 'you' | 'them'; text: string; ts: number }[]>([])
  const [chatText, setChatText] = useState('')

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            {methodIcon}
            {appt.method.toUpperCase()} session
          </DialogTitle>
          <DialogDescription>
            {clientName} with {proName} • {humanDateTime(new Date(appt.startISO))}
          </DialogDescription>
        </DialogHeader>

        {appt.method === 'chat' && (
          <div className="grid grid-rows-[1fr_auto] h-[420px] border rounded-md overflow-hidden">
            <div className="p-3 space-y-2 overflow-auto">
              {chatLog.length === 0 && (
                <div className="text-sm text-muted-foreground">Chat started. This is a demo room — messages are local only.</div>
              )}
              {chatLog.map((m, i) => (
                <div key={i} className={cn('max-w-[80%] rounded-md px-3 py-2 text-sm transition-all', m.who === 'you' ? 'bg-emerald-100 dark:bg-emerald-500/10 ml-auto' : 'bg-muted')}>
                  <div className="text-[10px] text-muted-foreground mb-1">{m.who === 'you' ? 'You' : proName}</div>
                  <div>{m.text}</div>
                </div>
              ))}
            </div>
            <div className="p-2 border-t flex items-center gap-2">
              <Input
                placeholder="Type a message..."
                value={chatText}
                onChange={(e) => setChatText(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && chatText.trim()) {
                    setChatLog(prev => [...prev, { who: 'you', text: chatText.trim(), ts: Date.now() }])
                    setChatText('')
                  }
                }}
              />
              <Button
                className="bg-emerald-600 hover:bg-emerald-700 text-white transition-colors"
                onClick={() => {
                  if (!chatText.trim()) return
                  setChatLog(prev => [...prev, { who: 'you', text: chatText.trim(), ts: Date.now() }])
                  setChatText('')
                }}
              >
                Send
              </Button>
            </div>
          </div>
        )}

        {appt.method !== 'chat' && (
          <div className="grid gap-3">
            <div className="rounded-md border p-4 bg-muted/40">
              <div className="text-sm text-muted-foreground">
                This is a stub session UI. Replace with WebRTC/LiveKit or your provider for real audio/video.
              </div>
              <div className="mt-3 grid sm:grid-cols-2 gap-3">
                <div className="aspect-video rounded-md bg-black/80 grid place-items-center text-white text-xs">
                  Local preview
                </div>
                <div className="aspect-video rounded-md bg-black/60 grid place-items-center text-white text-xs">
                  Remote stream
                </div>
              </div>
              <div className="mt-3 flex items-center gap-2">
                <Button variant="outline" className="transition-colors">Toggle mic</Button>
                <Button variant="outline" className="transition-colors">Toggle camera</Button>
                <Button className="bg-emerald-600 hover:bg-emerald-700 text-white transition-colors">Start</Button>
              </div>
            </div>
          </div>
        )}

        <DialogFooter>
          <Button variant="outline" className="transition-colors" onClick={() => onOpenChange(false)}>Close</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
