import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Booking, UserAccount } from '../types';
import * as store from '../services/store';
import type { AuditLog } from '../services/store';
import { 
  X, Shield, Lock, Users, Briefcase, RefreshCw, ChevronDown, Check,
  Sliders, Search, Star, Award, TrendingUp, Sparkles, Filter, 
  MapPin, Phone, Mail, Clock, Calendar, CheckSquare, PlusCircle, AlertCircle, Play,
  LogOut, Receipt, Wallet, FileText, CheckCircle2, MessageSquare,
  ExternalLink, Printer, Plus, Key, ArrowUpRight, ArrowDownRight, Trash2
} from 'lucide-react';
import LiveDispatchMap from './LiveDispatchMap';

interface AdminDashboardProps {
  isOpen: boolean;
  onClose: () => void;
  activeBookings: Booking[];
  onUpdateBookings: (bookings: Booking[]) => void;
}


export default function AdminDashboard({
  isOpen,
  onClose,
  activeBookings,
  onUpdateBookings
}: AdminDashboardProps) {
  // Authentication states
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [passcode, setPasscode] = useState('');
  const [loginError, setLoginError] = useState('');
  const [currentSupervisor, setCurrentSupervisor] = useState('Supervisor Unit 01 (Bomso HQ)');

  // Navigation tab state
  const [activeTab, setActiveTab] = useState<'pipeline' | 'patrons' | 'financials' | 'settings'>('pipeline');

  // Active Map tracking for Supervisor
  const [trackedBookingId, setTrackedBookingId] = useState<string | null>(null);

  // Itemized receipt modal for financials
  const [receiptModalBooking, setReceiptModalBooking] = useState<Booking | null>(null);

  // Search & Filter state
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [suburbFilter, setSuburbFilter] = useState<string>('all');
  const [paymentFilter, setPaymentFilter] = useState<string>('all');

  // Patron point adjustment drawer state
  const [selectedPatronEmail, setSelectedPatronEmail] = useState<string | null>(null);
  const [pointsChangeAmount, setPointsChangeAmount] = useState<string>('150');
  const [pointsReason, setPointsReason] = useState<string>('Specialist stain-treatment compensation');
  const [patronSearchQuery, setPatronSearchQuery] = useState('');

  // Passcode settings state
  const [savedPasscode, setSavedPasscode] = useState('1212');
  const [newPasscode, setNewPasscode] = useState('');
  const [passcodeSuccessMsg, setPasscodeSuccessMsg] = useState('');

  // Storage hooks for accounts & audit logs
  const [accounts, setAccounts] = useState<UserAccount[]>([]);
  const [auditLogs, setAuditLogs] = useState<AuditLog[]>([]);
  const [successNotif, setSuccessNotif] = useState<string>('');

  // Master stage cycle
  const statusCycle: Booking['status'][] = [
    'Scheduled', 'Collecting', 'In Care', 'Ironing & Folding', 'Quality Check', 'Delivered'
  ];

  // Helper to append audit log
  const logAuditAction = (action: string, details: string, type: AuditLog['type']) => {
    const newEntry: AuditLog = {
      id: `LOG-${Math.floor(1000 + Math.random() * 9000)}`,
      timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' }),
      action,
      details,
      supervisor: currentSupervisor,
      type
    };
    const updated = [newEntry, ...auditLogs].slice(0, 50); // Keep last 50
    setAuditLogs(updated);
    try {
      store.writeAuditLogs(updated);
    } catch (e) {
      console.warn(e);
    }
  };

  // Load initial database & logs
  const loadDatabase = () => {
    try {
      const savedAccounts: UserAccount[] = store.readAccounts();
      const savedBookings: Booking[] = store.readBookings();
      const savedLogs: AuditLog[] = store.readAuditLogs();
      
      if (savedLogs.length > 0) {
        setAuditLogs(savedLogs);
      } else {
        // Initial seed logs
        const initialLogs: AuditLog[] = [
          {
            id: 'LOG-1001',
            timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
            action: 'Desk Bootup',
            details: 'Master Supervisor Desk initialized for Kumasi Operations',
            supervisor: 'Supervisor Unit 01 (Bomso HQ)',
            type: 'system'
          }
        ];
        setAuditLogs(initialLogs);
      }

      // Auto-populate accounts if empty but bookings exist
      if (savedAccounts.length === 0 && savedBookings.length > 0) {
        const uniqueContacts = Array.from(new Set(savedBookings.map(b => b.email)));
        const syncAccounts = uniqueContacts.map(email => {
          const matchingBooking = savedBookings.find(b => b.email === email)!;
          return {
            email: matchingBooking.email,
            phone: matchingBooking.phone,
            passwordHash: 'password',
            name: matchingBooking.name,
            points: 750,
            createdAt: new Date().toISOString()
          };
        });
        store.writeAccounts(syncAccounts);
        setAccounts(syncAccounts);
      } else {
        const sanitised = savedAccounts.map(acc => ({
          ...acc,
          points: acc.points !== undefined ? acc.points : 650
        }));
        setAccounts(sanitised);
      }
    } catch (e) {
      console.warn('Error syncing ledger data.', e);
    }
  };

  useEffect(() => {
    if (isOpen) {
      loadDatabase();
    }
  }, [isOpen, activeBookings]);

  // Handle Passcode verification
  const handleAuthSubmit = (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    const cleanCode = passcode.trim().toLowerCase();
    if (
      cleanCode === 'admin' ||
      cleanCode === 'manager' ||
      cleanCode === '1212' ||
      cleanCode === savedPasscode.toLowerCase() ||
      cleanCode === ''
    ) {
      setIsAuthenticated(true);
      setLoginError('');
      triggerFlashNotification('Authorized supervisor session booted successfully.');
      logAuditAction('Session Authenticated', 'Supervisor unlocked Master Desk control unit', 'system');
    } else {
      setLoginError('Invalid Administrator credentials. Type "1212", "admin", or click Demo Bypass.');
    }
  };

  // Auto-helper for Flash notifications in header
  const triggerFlashNotification = (msg: string) => {
    setSuccessNotif(msg);
    setTimeout(() => {
      setSuccessNotif('');
    }, 4000);
  };

  // Change order status directly
  const handleUpdateStatus = (bookingId: string, newStatus: Booking['status']) => {
    try {
      const updated = activeBookings.map(booking => {
        if (booking.id === bookingId) {
          return { ...booking, status: newStatus };
        }
        return booking;
      });

      store.writeBookings(updated);
      onUpdateBookings(updated);
      triggerFlashNotification(`Order ${bookingId} stage updated to [${newStatus}]!`);
      logAuditAction('Stage Advance', `Order ${bookingId} transitioned to [${newStatus}]`, 'stage');
    } catch (e) {
      console.error(e);
    }
  };

  // Toggle Payment Status
  const handleTogglePaymentStatus = (bookingId: string) => {
    let generatedTxn = '';
    const updated = activeBookings.map(b => {
      if (b.id === bookingId) {
        const isPaid = b.paymentStatus === 'Paid';
        generatedTxn = 'TXN-ADMIN-' + Math.floor(100000 + Math.random() * 900000);
        return {
          ...b,
          paymentStatus: isPaid ? ('Pay on Pickup' as const) : ('Paid' as const),
          paymentMethod: isPaid ? b.paymentMethod : (b.paymentMethod || 'Settlement Override'),
          transactionRef: isPaid ? undefined : generatedTxn,
          paidAt: isPaid ? undefined : new Date().toISOString()
        };
      }
      return b;
    });

    store.writeBookings(updated);
    onUpdateBookings(updated);

    const targetBooking = activeBookings.find(b => b.id === bookingId);
    const wasPaid = targetBooking?.paymentStatus === 'Paid';
    
    triggerFlashNotification(
      wasPaid 
        ? `Order ${bookingId} set to UNPAID / COD.` 
        : `Order ${bookingId} marked PAID (${generatedTxn})!`
    );

    logAuditAction(
      'Payment Settlement',
      wasPaid ? `Order ${bookingId} marked Unpaid / COD` : `Order ${bookingId} settled PAID with ${generatedTxn}`,
      'payment'
    );
  };

  // Delete single booking from master supervisor desk
  const handleDeleteBooking = (bookingId: string) => {
    if (!window.confirm(`Are you sure you want to delete order ${bookingId} from the master supervisor ledger?`)) {
      return;
    }
    try {
      const updated = activeBookings.filter(b => b.id !== bookingId);
      store.writeBookings(updated);
      onUpdateBookings(updated);
      triggerFlashNotification(`Order ${bookingId} removed from master ledger.`);
      logAuditAction('Order Deleted', `Supervisor deleted order ${bookingId} from master ledger`, 'system');
    } catch (e) {
      console.error(e);
    }
  };

  // Clear all bookings from master supervisor desk
  const handleClearAllBookings = () => {
    if (activeBookings.length === 0) return;
    if (!window.confirm(`MASTER OVERRIDE: Are you sure you want to CLEAR ALL (${activeBookings.length}) orders from the master pipeline? This action cannot be undone.`)) {
      return;
    }
    try {
      store.writeBookings([]);
      onUpdateBookings([]);
      triggerFlashNotification('All orders cleared from master pipeline.');
      logAuditAction('Pipeline Cleared', 'Supervisor executed bulk purge of all active orders', 'system');
    } catch (e) {
      console.error(e);
    }
  };

  // Adjust Patron Care Points
  const handleAdjustPoints = (email: string, action: 'add' | 'subtract') => {
    try {
      const amount = parseInt(pointsChangeAmount);
      if (isNaN(amount) || amount <= 0) {
        triggerFlashNotification('Please enter a valid positive score to adjust.');
        return;
      }

      let patronName = email;
      const updatedAccounts = accounts.map(acc => {
        if (acc.email.toLowerCase() === email.toLowerCase()) {
          patronName = acc.name;
          const currentPoints = acc.points || 0;
          const targetPoints = action === 'add' ? currentPoints + amount : Math.max(0, currentPoints - amount);
          return {
            ...acc,
            points: targetPoints
          };
        }
        return acc;
      });

      store.writeAccounts(updatedAccounts);
      setAccounts(updatedAccounts);
      
      // Update matching entry in current user session if relevant
      const parsedSession = store.readCurrentUser();
      if (parsedSession) {
        if (parsedSession.email.toLowerCase() === email.toLowerCase()) {
          const currentPoints = parsedSession.points || 0;
          parsedSession.points = action === 'add' ? currentPoints + amount : Math.max(0, currentPoints - amount);
          store.writeCurrentUser(parsedSession);
        }
      }

      triggerFlashNotification(
        `Certified ${action === 'add' ? '+' : '-'}${amount} Points for ${patronName}!`
      );

      logAuditAction(
        'Points Adjusted',
        `${action === 'add' ? 'Awarded +' : 'Deducted -'}${amount} pts for ${patronName} (${email}). Reason: ${pointsReason}`,
        'points'
      );

      setSelectedPatronEmail(null);
    } catch (e) {
      console.warn(e);
    }
  };

  // Generate test mock booking for demo
  const createSimulatedBooking = () => {
    const mockNames = ['Dr. Peter Cobbold', 'Lady Beatrice Tabua', 'Prof. Ernest Sarpong', 'Kwadwo Oppong-Mintah', 'Abena Pokua', 'Emmanuel Asante'];
    const mockPhones = ['+233 24 456 7890', '+233 25 111 2233', '+233 20 888 9999', '+233 26 123 4567', '+233 55 404 9020', '+233 24 990 1234'];
    const mockSuburbs = ['Ayeduase', 'Bomso', 'Kotei', 'Kentinkrono', 'Gaza', 'Hall 7'];
    const mockServices = ['Curated Silk Steam-Press', 'Premium Care Bundle', 'Fragrant Linen Hot-Wash', 'Woolen Sanctuary Restructure'];
    const mockScents = ['Organic Lavender Essence', 'Royal Jasmine Bud', 'Botanical Eucalyptus Spray', 'Unscented Pure Cleanse'];
    const mockNotes = ['Gaza Hostel Room 304', 'Near Unity Hall C-204', 'Opposite Bomso Junction Police Post', 'Evandy Hostel Block B Room 102'];

    const randomIdx = Math.floor(Math.random() * mockNames.length);
    const mockId = `FF-${Math.floor(10000 + Math.random() * 90000)}`;
    const randomName = mockNames[randomIdx];
    const cleanedEmail = `${randomName.toLowerCase().replace(/[\s.-]/g, '')}@gmail.com`;

    const newMockBooking: Booking = {
      id: mockId,
      name: randomName,
      email: cleanedEmail,
      phone: mockPhones[randomIdx],
      serviceType: mockServices[Math.floor(Math.random() * mockServices.length)],
      specialtyAddons: [mockScents[Math.floor(Math.random() * mockScents.length)]],
      pickupDate: 'Today',
      pickupTime: '10:00 AM - 12:00 PM',
      deliveryDate: 'Tomorrow, 4:00 PM',
      address: `Villas Road Block ${Math.floor(1 + Math.random() * 12)}`,
      notes: mockNotes[Math.floor(Math.random() * mockNotes.length)],
      city: 'Kumasi',
      suburb: mockSuburbs[Math.floor(Math.random() * mockSuburbs.length)],
      status: 'Scheduled',
      paymentStatus: Math.random() > 0.4 ? 'Paid' : 'Pay on Pickup',
      paymentMethod: 'MoMo Express',
      amount: Math.floor(65 + Math.random() * 90),
      transactionRef: `TXN-SIM-${Math.floor(100000 + Math.random() * 900000)}`,
      createdAt: new Date().toISOString()
    };

    try {
      const currentBookings = [newMockBooking, ...activeBookings];
      store.writeBookings(currentBookings);
      onUpdateBookings(currentBookings);
      
      // Also register their UserAccount if not existing
      const allAccounts: UserAccount[] = store.readAccounts();
      if (!allAccounts.some(acc => acc.email.toLowerCase() === cleanedEmail.toLowerCase())) {
        allAccounts.push({
          email: cleanedEmail,
          phone: newMockBooking.phone,
          passwordHash: 'password',
          name: newMockBooking.name,
          points: 850,
          createdAt: new Date().toISOString()
        });
        store.writeAccounts(allAccounts);
        setAccounts(allAccounts);
      }

      triggerFlashNotification(`Created simulated client: ${randomName} (${mockId})!`);
      logAuditAction('Demo Client Generated', `Simulated order ${mockId} for ${randomName} in ${newMockBooking.suburb}`, 'system');
    } catch (e) {
      console.warn(e);
    }
  };

  // Filter active bookings
  const filteredBookings = activeBookings.filter(b => {
    const query = searchQuery.toLowerCase();
    const matchesSearch = b.name.toLowerCase().includes(query) || 
                          b.id.toLowerCase().includes(query) ||
                          b.phone.toLowerCase().includes(query) ||
                          b.email.toLowerCase().includes(query) ||
                          b.suburb.toLowerCase().includes(query) ||
                          (b.notes && b.notes.toLowerCase().includes(query));
    
    const matchesStatus = statusFilter === 'all' || b.status === statusFilter;
    const matchesSuburb = suburbFilter === 'all' || b.suburb === suburbFilter;
    const matchesPayment = paymentFilter === 'all' || 
                           (paymentFilter === 'Paid' && b.paymentStatus === 'Paid') ||
                           (paymentFilter === 'Unpaid' && b.paymentStatus !== 'Paid');

    return matchesSearch && matchesStatus && matchesSuburb && matchesPayment;
  });

  // Filter patrons list
  const filteredPatrons = accounts.filter(acc => {
    const query = patronSearchQuery.toLowerCase();
    return acc.name.toLowerCase().includes(query) ||
           acc.email.toLowerCase().includes(query) ||
           acc.phone.toLowerCase().includes(query);
  });

  // Calculate stats
  const uniqueSuburbs = Array.from(new Set(activeBookings.map(b => b.suburb)));
  const totalRevenue = activeBookings
    .filter(b => b.paymentStatus === 'Paid')
    .reduce((sum, b) => sum + (b.amount || 50), 0);
  const unpaidCount = activeBookings.filter(b => b.paymentStatus !== 'Paid').length;

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex flex-col pt-[72px] bg-brand-charcoal text-white overflow-y-auto">
      
      {/* Top Banner Status Bar */}
      <div className="bg-[#121212] py-3 px-6 border-b border-white/10 flex items-center justify-between z-25 relative shrink-0">
        <div className="flex items-center space-x-3">
          <div className="flex items-center space-x-2">
            <span className="w-2.5 h-2.5 rounded-full bg-emerald-400 animate-pulse" />
            <span className="font-mono text-[10px] tracking-[0.25em] text-brand-gold uppercase font-black">
              FRESHFOLD HQ • MASTER SUPERVISOR DESK
            </span>
          </div>
          <span className="hidden md:inline-block text-stone-600 font-mono text-xs">|</span>
          <span className="hidden md:inline-block font-sans text-xs text-stone-400 font-medium">
            Kumasi Operations Control Center
          </span>
        </div>

        <div className="flex items-center space-x-3">
          <button
            onClick={onClose}
            className="px-3 py-1.5 text-xs tracking-widest text-stone-300 hover:text-white uppercase font-bold font-sans flex items-center gap-1.5 bg-white/5 hover:bg-white/15 rounded-xl transition-all border border-white/10 cursor-pointer shadow-sm"
          >
            <X className="w-3.5 h-3.5" />
            <span>Exit Desk</span>
          </button>
        </div>
      </div>

      <div className="flex-1 max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 w-full relative">
        <div className="absolute top-12 left-10 w-[400px] h-[400px] bg-brand-gold/5 blur-[150px] pointer-events-none rounded-full" />
        <div className="absolute bottom-1/4 right-1/4 w-[300px] h-[300px] bg-brand-sage/5 blur-[120px] pointer-events-none rounded-full" />

        <AnimatePresence mode="wait">
          
          {/* SCREEN A: PASSCODE LOCK GATE */}
          {!isAuthenticated && (
            <motion.div
              key="auth-sec"
              initial={{ opacity: 0, y: 15 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -15 }}
              className="max-w-md mx-auto my-12 bg-[#161616] p-8 rounded-2xl border border-white/10 shadow-2xl text-left relative overflow-hidden"
            >
              <div className="absolute top-0 right-0 w-32 h-32 bg-brand-gold/10 rounded-full blur-2xl pointer-events-none" />

              <div className="text-center space-y-3 mb-6">
                <div className="inline-flex p-3.5 bg-brand-gold/10 border border-brand-gold/30 rounded-2xl text-brand-gold shadow-inner">
                  <Shield className="w-8 h-8" />
                </div>
                <h3 className="font-serif text-2xl text-white font-light">
                  Supervisor Desk Verification
                </h3>
                <p className="font-sans text-stone-400 text-xs font-light max-w-xs mx-auto leading-relaxed">
                  Enter administrative passcode to access Kumasi live dispatch telemetry, patron point ledgers, and payment overrides.
                </p>
              </div>

              {loginError && (
                <div className="bg-red-500/10 border border-red-500/30 text-red-400 rounded-xl p-3 text-xs flex items-center gap-2 mb-4">
                  <AlertCircle className="w-4 h-4 text-red-400 shrink-0" />
                  <span>{loginError}</span>
                </div>
              )}

              <form onSubmit={handleAuthSubmit} className="space-y-4">
                <div className="space-y-1.5">
                  <label className="font-mono text-[10px] uppercase font-bold tracking-widest text-stone-400 block">Supervisor Passcode</label>
                  <div className="relative">
                    <Lock className="absolute left-3.5 top-3.5 w-4 h-4 text-stone-500" />
                    <input
                      type="password"
                      value={passcode}
                      onChange={(e) => setPasscode(e.target.value)}
                      placeholder='Default PIN: 1212 or "admin"'
                      className="w-full bg-black border border-white/15 rounded-xl py-3 pl-10 pr-4 text-xs text-white focus:outline-none focus:border-brand-gold font-mono tracking-widest transition-all"
                      autoFocus
                    />
                  </div>
                </div>

                <button
                  type="submit"
                  className="w-full py-3.5 bg-brand-gold hover:bg-brand-gold-light text-black font-extrabold uppercase font-sans text-xs tracking-widest rounded-xl transition-all cursor-pointer flex items-center justify-center space-x-2 shadow-lg"
                >
                  <Key className="w-4 h-4" />
                  <span>Verify Passcode & Enter Desk</span>
                </button>

                <div className="pt-3 border-t border-white/10 text-center">
                  <button
                    type="button"
                    onClick={() => {
                      setPasscode('1212');
                      handleAuthSubmit();
                    }}
                    className="w-full py-2.5 bg-brand-sage/20 hover:bg-brand-sage/40 text-brand-sage border border-brand-sage/40 text-xs font-mono font-bold uppercase tracking-wider rounded-xl transition-all cursor-pointer flex items-center justify-center gap-1.5"
                  >
                    <Sparkles className="w-3.5 h-3.5" /> Direct Click-to-Bypass PIN (Demo Mode)
                  </button>
                </div>
              </form>
            </motion.div>
          )}

          {/* SCREEN B: AUTHORIZED MANAGER DESK */}
          {isAuthenticated && (
            <motion.div
              key="desk-sec"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="space-y-6 text-left"
            >
              
              {/* Toast Action Notifications */}
              {successNotif && (
                <div className="fixed top-20 z-[100] left-1/2 -translate-x-1/2 bg-brand-gold text-black px-6 py-3 rounded-full text-xs font-bold font-sans tracking-wide uppercase flex items-center space-x-2.5 shadow-2xl border border-black/20">
                  <Sparkles className="w-4 h-4 text-black animate-spin" />
                  <span>{successNotif}</span>
                </div>
              )}

              {/* TOP HEADER & NAVIGATION BAR */}
              <div className="bg-[#161616] rounded-2xl border border-white/10 p-6 relative overflow-hidden shadow-xl">
                <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-6">
                  
                  {/* Left: Supervisor Identity & Welcome Banner */}
                  <div className="flex items-center space-x-4">
                    <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-brand-gold/30 to-black border border-brand-gold/50 flex items-center justify-center text-brand-gold text-2xl font-serif shadow-inner shrink-0">
                      <Shield className="w-7 h-7 text-brand-gold" />
                    </div>
                    <div>
                      <div className="flex items-center space-x-2">
                        <span className="px-2 py-0.5 bg-brand-gold/10 border border-brand-gold/30 rounded text-[9px] font-mono text-brand-gold font-bold uppercase tracking-widest">
                          Authorized Session
                        </span>
                        <span className="text-stone-500 font-mono text-xs">•</span>
                        <span className="text-stone-400 font-mono text-xs">Kumasi HQ</span>
                      </div>
                      <h3 className="font-serif text-2xl font-light text-white mt-1">
                        FreshFold Master Supervisor Desk
                      </h3>
                      <p className="font-sans text-xs text-stone-400 font-light mt-0.5">
                        Active Unit: <span className="text-stone-200 font-medium">{currentSupervisor}</span>
                      </p>
                    </div>
                  </div>

                  {/* Right: Quick Action Controls */}
                  <div className="flex items-center gap-3 shrink-0 flex-wrap">
                    <button
                      onClick={createSimulatedBooking}
                      className="px-4 py-2.5 bg-brand-sage hover:bg-brand-sage-light text-white rounded-xl text-xs font-sans font-bold uppercase tracking-wider transition-all flex items-center gap-2 cursor-pointer shadow-md"
                    >
                      <Plus className="w-4 h-4" />
                      <span>+ Demo Client</span>
                    </button>

                    <button
                      onClick={loadDatabase}
                      className="px-3.5 py-2.5 bg-black/50 hover:bg-white/10 border border-white/10 text-stone-300 hover:text-white rounded-xl text-xs font-mono font-bold uppercase tracking-wider cursor-pointer transition-all flex items-center gap-1.5"
                      title="Sync Database"
                    >
                      <RefreshCw className="w-3.5 h-3.5 text-brand-gold" />
                      <span>Sync Ledger</span>
                    </button>

                    <button
                      onClick={() => setIsAuthenticated(false)}
                      className="p-2.5 bg-black/50 hover:bg-red-500/20 text-stone-400 hover:text-red-400 rounded-xl text-xs font-mono tracking-wider uppercase font-bold border border-white/10 cursor-pointer flex items-center gap-1 transition-all"
                      title="Lock Desk Session"
                    >
                      <Lock className="w-4 h-4" />
                    </button>
                  </div>
                </div>

                {/* METRICS DASHBOARD BANNER */}
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mt-6 pt-6 border-t border-white/10">
                  <div className="p-3.5 bg-black/40 rounded-xl border border-white/5">
                    <span className="text-stone-400 text-[9px] font-mono uppercase block font-bold">Active Kumasi Orders</span>
                    <div className="text-2xl font-serif text-white font-semibold mt-1 flex items-baseline gap-2">
                      <span>{activeBookings.length}</span>
                      <span className="text-[10px] font-mono text-brand-sage font-normal">In Pipeline</span>
                    </div>
                  </div>

                  <div className="p-3.5 bg-black/40 rounded-xl border border-white/5">
                    <span className="text-stone-400 text-[9px] font-mono uppercase block font-bold">Registered Patrons</span>
                    <div className="text-2xl font-serif text-brand-gold font-semibold mt-1 flex items-baseline gap-2">
                      <span>{accounts.length}</span>
                      <span className="text-[10px] font-mono text-stone-400 font-normal">Patrons</span>
                    </div>
                  </div>

                  <div className="p-3.5 bg-black/40 rounded-xl border border-white/5">
                    <span className="text-stone-400 text-[9px] font-mono uppercase block font-bold">Settled Revenue</span>
                    <div className="text-2xl font-serif text-emerald-400 font-semibold mt-1 flex items-baseline gap-1">
                      <span>₵{totalRevenue}.00</span>
                      <span className="text-[9px] font-mono text-stone-400 font-normal uppercase">GHS</span>
                    </div>
                  </div>

                  <div className="p-3.5 bg-black/40 rounded-xl border border-white/5">
                    <span className="text-stone-400 text-[9px] font-mono uppercase block font-bold">Pending Unpaid / COD</span>
                    <div className="text-2xl font-serif text-amber-400 font-semibold mt-1 flex items-baseline gap-2">
                      <span>{unpaidCount}</span>
                      <span className="text-[10px] font-mono text-stone-400 font-normal">Orders</span>
                    </div>
                  </div>
                </div>

                {/* SIMPLE NAVIGATION TAB BAR */}
                <div className="flex items-center gap-2 pt-6 mt-6 border-t border-white/10 overflow-x-auto">
                  <button
                    type="button"
                    onClick={() => setActiveTab('pipeline')}
                    className={`px-4 py-2.5 rounded-xl text-xs font-sans tracking-wider uppercase font-bold transition-all flex items-center gap-2 whitespace-nowrap cursor-pointer ${
                      activeTab === 'pipeline'
                        ? 'bg-brand-sage text-white border border-brand-sage shadow-md'
                        : 'bg-black/40 text-stone-400 border border-white/5 hover:text-white hover:bg-black/70'
                    }`}
                  >
                    <Sliders className="w-3.5 h-3.5" />
                    <span>Live Pipeline ({activeBookings.length})</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => setActiveTab('patrons')}
                    className={`px-4 py-2.5 rounded-xl text-xs font-sans tracking-wider uppercase font-bold transition-all flex items-center gap-2 whitespace-nowrap cursor-pointer ${
                      activeTab === 'patrons'
                        ? 'bg-brand-gold text-black border border-brand-gold shadow-md'
                        : 'bg-black/40 text-stone-400 border border-white/5 hover:text-white hover:bg-black/70'
                    }`}
                  >
                    <Users className="w-3.5 h-3.5" />
                    <span>Patron Directory ({accounts.length})</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => setActiveTab('financials')}
                    className={`px-4 py-2.5 rounded-xl text-xs font-sans tracking-wider uppercase font-bold transition-all flex items-center gap-2 whitespace-nowrap cursor-pointer ${
                      activeTab === 'financials'
                        ? 'bg-emerald-600 text-white border border-emerald-500 shadow-md'
                        : 'bg-black/40 text-stone-400 border border-white/5 hover:text-white hover:bg-black/70'
                    }`}
                  >
                    <Receipt className="w-3.5 h-3.5" />
                    <span>Financial Settlement</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => setActiveTab('settings')}
                    className={`px-4 py-2.5 rounded-xl text-xs font-sans tracking-wider uppercase font-bold transition-all flex items-center gap-2 whitespace-nowrap cursor-pointer ${
                      activeTab === 'settings'
                        ? 'bg-white text-black border border-white shadow-md'
                        : 'bg-black/40 text-stone-400 border border-white/5 hover:text-white hover:bg-black/70'
                    }`}
                  >
                    <Shield className="w-3.5 h-3.5" />
                    <span>System Settings & Audit Logs</span>
                  </button>
                </div>

              </div>

              {/* TAB CONTENT PANELS */}

              {/* TAB 1: LIVE ORDER PIPELINE & DISPATCH MAP */}
              {activeTab === 'pipeline' && (
                <div className="bg-[#161616] p-6 rounded-2xl border border-white/10 space-y-6">
                  
                  {/* Search and Advanced Filters Bar */}
                  <div className="flex flex-col md:flex-row gap-4 items-center justify-between pb-4 border-b border-white/10">
                    <div className="relative w-full md:w-96">
                      <Search className="absolute left-3.5 top-3.5 w-4 h-4 text-stone-500" />
                      <input
                        type="text"
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                        placeholder="Search by Order ID, Client Name, Phone, Suburb..."
                        className="w-full bg-black border border-white/10 rounded-xl py-2.5 pl-10 pr-4 text-xs text-white focus:outline-none focus:border-brand-sage transition-colors"
                      />
                    </div>

                    <div className="flex flex-wrap gap-2.5 w-full md:w-auto">
                      <select
                        value={statusFilter}
                        onChange={(e) => setStatusFilter(e.target.value)}
                        className="bg-black text-xs text-stone-300 font-sans border border-white/10 rounded-xl px-3 py-2.5 focus:border-brand-gold focus:outline-none cursor-pointer"
                      >
                        <option value="all">Filter Stage: All Stages</option>
                        {statusCycle.map(st => (
                          <option key={st} value={st}>{st}</option>
                        ))}
                      </select>

                      <select
                        value={suburbFilter}
                        onChange={(e) => setSuburbFilter(e.target.value)}
                        className="bg-black text-xs text-stone-300 font-sans border border-white/10 rounded-xl px-3 py-2.5 focus:border-brand-gold focus:outline-none cursor-pointer"
                      >
                        <option value="all">Filter Suburb: All Neighborhoods</option>
                        {uniqueSuburbs.map(sub => (
                          <option key={sub} value={sub}>{sub}</option>
                        ))}
                      </select>

                      <select
                        value={paymentFilter}
                        onChange={(e) => setPaymentFilter(e.target.value)}
                        className="bg-black text-xs text-stone-300 font-sans border border-white/10 rounded-xl px-3 py-2.5 focus:border-brand-gold focus:outline-none cursor-pointer"
                      >
                        <option value="all">Payment: All Statuses</option>
                        <option value="Paid">PAID Only</option>
                        <option value="Unpaid">UNPAID / COD</option>
                      </select>
                    </div>
                  </div>

                  {/* Orders Cards List */}
                  {filteredBookings.length === 0 ? (
                    <div className="text-center py-16 bg-black/20 rounded-2xl border border-white/5 space-y-3">
                      <Sliders className="w-10 h-10 text-stone-600 mx-auto" />
                      <p className="font-serif text-stone-400 text-sm">No live orders found matching filters.</p>
                      <button
                        onClick={createSimulatedBooking}
                        className="px-4 py-2 bg-brand-gold text-black font-bold text-xs font-sans tracking-widest uppercase rounded-xl cursor-pointer hover:bg-brand-gold-light transition-all"
                      >
                        + Generate Test Order
                      </button>
                    </div>
                  ) : (
                    <div className="space-y-5">
                      {filteredBookings.map((b) => (
                        <div 
                          key={b.id} 
                          className="p-5 bg-black/40 rounded-2xl border border-white/10 space-y-4 text-xs hover:border-brand-gold/40 transition-all shadow-md"
                        >
                          {/* Card Header Row */}
                          <div className="flex flex-col md:flex-row justify-between md:items-center gap-3 pb-3 border-b border-white/10">
                            <div className="flex items-center space-x-3">
                              <span className="font-mono text-brand-gold font-extrabold px-2 py-1 bg-brand-gold/10 border border-brand-gold/30 rounded-lg text-xs">
                                {b.id}
                              </span>
                              <div>
                                <h4 className="font-sans text-white font-bold text-sm">{b.name}</h4>
                                <div className="flex items-center space-x-3 text-[11px] text-stone-400 font-light mt-0.5">
                                  <span className="flex items-center gap-1"><Phone className="w-3 h-3 text-brand-gold" /> {b.phone}</span>
                                  <span>•</span>
                                  <span className="flex items-center gap-1"><Mail className="w-3 h-3 text-brand-gold" /> {b.email}</span>
                                </div>
                              </div>
                            </div>

                            <div className="flex items-center gap-3">
                              <div className="text-left md:text-right">
                                <span className="font-mono text-[9px] uppercase tracking-wider text-stone-400 block font-bold">CARE PACKAGE</span>
                                <span className="text-brand-sage font-semibold uppercase font-sans text-xs block">{b.serviceType}</span>
                              </div>

                              <button
                                type="button"
                                onClick={() => handleDeleteBooking(b.id)}
                                className="px-2.5 py-1.5 bg-red-500/15 hover:bg-red-500/30 text-red-400 border border-red-500/30 rounded-xl text-[10px] font-mono font-bold uppercase tracking-wider flex items-center gap-1 transition-all cursor-pointer"
                                title={`Delete order ${b.id} from master ledger`}
                              >
                                <Trash2 className="w-3.5 h-3.5 text-red-400" />
                                <span className="hidden sm:inline">Delete</span>
                              </button>
                            </div>
                          </div>

                          {/* Order Specifications Grid */}
                          <div className="grid grid-cols-1 md:grid-cols-3 gap-3 bg-white/5 p-3.5 rounded-xl text-xs text-stone-300">
                            <div>
                              <span className="block text-[9px] font-mono text-stone-400 font-bold uppercase mb-1">LOCATION & ROOM LANDMARK</span>
                              <p className="text-white font-medium flex items-start gap-1">
                                <MapPin className="w-3.5 h-3.5 text-brand-sage shrink-0 mt-0.5" />
                                <span>{b.address}, <strong className="text-brand-gold">{b.suburb}</strong></span>
                              </p>
                              {b.notes && (
                                <p className="text-[11px] text-brand-gold font-sans mt-1 bg-brand-gold/10 px-2 py-1 rounded border border-brand-gold/20 italic">
                                  Landmark: {b.notes}
                                </p>
                              )}
                            </div>

                            <div>
                              <span className="block text-[9px] font-mono text-stone-400 font-bold uppercase mb-1">AROMA & FRAGRANCE ADDON</span>
                              <p className="text-white font-medium flex items-center gap-1 italic">
                                <Sparkles className="w-3.5 h-3.5 text-brand-gold shrink-0" />
                                <span>{b.specialtyAddons ? b.specialtyAddons.join(', ') : 'Organic French Lavender'}</span>
                              </p>
                            </div>

                            <div>
                              <span className="block text-[9px] font-mono text-stone-400 font-bold uppercase mb-1">SETTLEMENT & OVERRIDE</span>
                              <div className="flex items-center justify-between">
                                <span className="font-mono font-bold text-white text-sm">₵{b.amount || 50}.00 GHS</span>
                                <button
                                  type="button"
                                  onClick={() => handleTogglePaymentStatus(b.id)}
                                  className={`px-2.5 py-1 rounded-lg font-mono text-[10px] font-bold uppercase tracking-wider cursor-pointer border transition-all ${
                                    b.paymentStatus === 'Paid'
                                      ? 'bg-emerald-500/20 text-emerald-400 border-emerald-500/40 hover:bg-emerald-500/30'
                                      : 'bg-amber-500/20 text-amber-400 border-amber-500/40 hover:bg-amber-500/30'
                                  }`}
                                >
                                  {b.paymentStatus === 'Paid' ? '✓ PAID' : 'UNPAID / COD'}
                                </button>
                              </div>
                              {b.transactionRef && (
                                <span className="block font-mono text-[9px] text-stone-400 mt-1 truncate">Ref: {b.transactionRef}</span>
                              )}
                            </div>
                          </div>

                          {/* ASSIGNED EXPRESS RIDER CARD WITH CALL / WHATSAPP */}
                          <div className="p-3 bg-black/60 rounded-xl border border-white/10 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                            <div className="flex items-center space-x-3">
                              <div className="w-9 h-9 rounded-xl bg-brand-sage/20 border border-brand-sage/40 flex items-center justify-center text-brand-sage shrink-0">
                                <Briefcase className="w-4 h-4" />
                              </div>
                              <div>
                                <span className="font-mono text-[9px] text-stone-400 uppercase tracking-wider block font-bold">Assigned Dispatch Rider</span>
                                <span className="text-white font-bold text-xs">Kwame — Express Courier Unit 4</span>
                                <span className="text-stone-400 text-[10px] block font-mono">Motorcycle: Yamaha DT125 • ETA 12 mins</span>
                              </div>
                            </div>

                            <div className="flex items-center space-x-2">
                              <a
                                href={`tel:${b.phone}`}
                                className="px-3 py-1.5 bg-white/10 hover:bg-white/20 text-white rounded-lg text-xs font-mono font-bold uppercase tracking-wider flex items-center gap-1 transition-all cursor-pointer"
                              >
                                <Phone className="w-3 h-3 text-emerald-400" /> Call
                              </a>
                              <a
                                href={`https://wa.me/${b.phone.replace(/[^0-9]/g, '')}`}
                                target="_blank"
                                rel="noreferrer"
                                className="px-3 py-1.5 bg-emerald-600/30 hover:bg-emerald-600/50 text-emerald-300 rounded-lg text-xs font-mono font-bold uppercase tracking-wider flex items-center gap-1 transition-all cursor-pointer border border-emerald-500/30"
                              >
                                <MessageSquare className="w-3 h-3" /> WhatsApp
                              </a>
                            </div>
                          </div>

                          {/* HORIZONTAL 6-STAGE INTERACTIVE PROGRESS BAR */}
                          <div className="pt-2">
                            <div className="flex items-center justify-between mb-2">
                              <span className="font-mono text-[10px] text-stone-400 uppercase font-bold tracking-wider">
                                6-Stage Pipeline Progress
                              </span>
                              <span className="font-mono text-xs text-brand-sage font-bold uppercase">
                                Stage: {b.status}
                              </span>
                            </div>

                            <div className="grid grid-cols-2 sm:grid-cols-6 gap-1.5">
                              {statusCycle.map((st, idx) => {
                                const currentIdx = statusCycle.indexOf(b.status);
                                const isCurrent = b.status === st;
                                const isPassed = currentIdx >= idx;

                                return (
                                  <button
                                    key={st}
                                    onClick={() => handleUpdateStatus(b.id, st)}
                                    className={`py-2 px-1.5 rounded-lg text-[9px] font-mono font-bold uppercase tracking-wider border transition-all cursor-pointer text-center ${
                                      isCurrent
                                        ? 'bg-brand-sage text-white border-brand-sage shadow-md scale-102'
                                        : isPassed
                                        ? 'bg-brand-sage/20 text-brand-sage border-brand-sage/30 hover:bg-brand-sage/30'
                                        : 'bg-black/50 text-stone-500 border-white/5 hover:text-stone-300 hover:border-white/20'
                                    }`}
                                  >
                                    <span className="block text-[8px] opacity-70">Step {idx + 1}</span>
                                    <span className="truncate block mt-0.5">{st}</span>
                                  </button>
                                );
                              })}
                            </div>
                          </div>

                          {/* EXPANDABLE GPS TELEMETRY MAP DRAWER & CARD ACTIONS */}
                          <div className="pt-2 border-t border-white/5 space-y-2">
                            <div className="flex flex-col sm:flex-row gap-2">
                              <button
                                onClick={() => setTrackedBookingId(trackedBookingId === b.id ? null : b.id)}
                                className={`flex-1 py-2 px-3 rounded-xl text-xs font-mono tracking-wider uppercase font-bold transition-all cursor-pointer flex items-center justify-center gap-2 ${
                                  trackedBookingId === b.id
                                    ? 'bg-brand-gold text-black border border-brand-gold'
                                    : 'bg-white/5 hover:bg-white/10 text-brand-gold border border-white/10'
                                }`}
                              >
                                <MapPin className="w-4 h-4" />
                                <span>{trackedBookingId === b.id ? 'Close Dispatch Telemetry Map' : 'Expand GPS Dispatch Telemetry Map'}</span>
                              </button>

                              <button
                                onClick={() => handleDeleteBooking(b.id)}
                                className="px-4 py-2 bg-red-500/15 hover:bg-red-500/30 text-red-400 border border-red-500/30 rounded-xl text-xs font-mono font-bold uppercase tracking-wider transition-all cursor-pointer flex items-center justify-center gap-1.5 shrink-0"
                                title={`Delete order ${b.id} from master ledger`}
                              >
                                <Trash2 className="w-3.5 h-3.5 text-red-400" />
                                <span>Purge Order</span>
                              </button>
                            </div>

                            {trackedBookingId === b.id && (
                              <motion.div
                                initial={{ opacity: 0, height: 0 }}
                                animate={{ opacity: 1, height: 'auto' }}
                                exit={{ opacity: 0, height: 0 }}
                                className="rounded-xl border border-white/10 p-2 bg-black/80 shadow-2xl overflow-hidden mt-2"
                              >
                                <LiveDispatchMap
                                  clientSuburb={b.suburb}
                                  clientAddress={b.address}
                                  bookingStatus={b.status}
                                  bookingId={b.id}
                                  clientName={b.name}
                                  clientCoords={b.pickupCoords}
                                  rider={b.rider}
                                />
                              </motion.div>
                            )}
                          </div>

                        </div>
                      ))}
                    </div>
                  )}

                </div>
              )}

              {/* TAB 2: PATRON DIRECTORY & LOYALTY LEDGER */}
              {activeTab === 'patrons' && (
                <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
                  
                  {/* Left: Patron Search & Directory Cards (Col 8) */}
                  <div className="lg:col-span-8 bg-[#161616] p-6 rounded-2xl border border-white/10 space-y-6">
                    <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 pb-4 border-b border-white/10">
                      <div>
                        <h4 className="font-serif text-lg font-light text-white flex items-center gap-2">
                          <Users className="w-5 h-5 text-brand-gold" />
                          <span>Patron Directory & Loyalty Ledger</span>
                        </h4>
                        <p className="font-sans text-xs text-stone-400 font-light mt-0.5">
                          Manage registered client accounts and inspect accrued Care Points.
                        </p>
                      </div>

                      <div className="relative w-full sm:w-64">
                        <Search className="absolute left-3 top-3 w-3.5 h-3.5 text-stone-500" />
                        <input
                          type="text"
                          value={patronSearchQuery}
                          onChange={(e) => setPatronSearchQuery(e.target.value)}
                          placeholder="Search patron..."
                          className="w-full bg-black border border-white/10 rounded-xl py-2 pl-9 pr-3 text-xs text-white focus:outline-none focus:border-brand-gold"
                        />
                      </div>
                    </div>

                    {filteredPatrons.length === 0 ? (
                      <div className="text-center py-12 bg-black/20 rounded-xl border border-white/5">
                        <p className="text-stone-400 text-xs font-serif">No patron accounts found.</p>
                      </div>
                    ) : (
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        {filteredPatrons.map((acc) => (
                          <div
                            key={acc.email}
                            className={`p-4 bg-black/40 rounded-xl border transition-all space-y-3 ${
                              selectedPatronEmail === acc.email
                                ? 'border-brand-gold bg-brand-gold/5'
                                : 'border-white/10 hover:border-white/20'
                            }`}
                          >
                            <div className="flex justify-between items-start">
                              <div>
                                <h5 className="font-serif text-white font-medium text-sm">{acc.name}</h5>
                                <span className="font-mono text-[10px] text-stone-400 block">{acc.email}</span>
                                <span className="font-mono text-[10px] text-stone-400 block">{acc.phone}</span>
                              </div>

                              <div className="text-right">
                                <span className="px-2 py-0.5 bg-brand-gold/10 text-brand-gold border border-brand-gold/30 rounded font-mono text-[9px] font-bold uppercase">
                                  Bespoke Tier
                                </span>
                              </div>
                            </div>

                            <div className="pt-2 border-t border-white/10 flex items-center justify-between">
                              <div>
                                <span className="text-stone-400 text-[9px] font-mono uppercase block">Care Points Balance</span>
                                <strong className="text-brand-gold font-sans font-bold text-base">{acc.points || 0} pts</strong>
                              </div>

                              <button
                                type="button"
                                onClick={() => {
                                  setSelectedPatronEmail(acc.email);
                                  setPointsReason('Bespoke boutique service reward');
                                }}
                                className="px-3 py-1.5 bg-brand-gold text-black rounded-lg text-xs font-mono font-bold uppercase tracking-wider hover:bg-brand-gold-light transition-all cursor-pointer flex items-center gap-1"
                              >
                                <Award className="w-3.5 h-3.5" /> Adjust Points
                              </button>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>

                  {/* Right: Points Adjustment Drawer (Col 4) */}
                  <div className="lg:col-span-4 bg-[#161616] p-6 rounded-2xl border border-white/10 space-y-5">
                    <div className="pb-3 border-b border-white/10">
                      <h5 className="font-serif text-base font-light text-white flex items-center gap-2">
                        <Award className="w-4 h-4 text-brand-gold" />
                        <span>Direct Care Points Adjuster</span>
                      </h5>
                      <p className="font-sans text-xs text-stone-400 font-light mt-0.5">
                        Award or deduct points with audit reason logging.
                      </p>
                    </div>

                    {selectedPatronEmail ? (
                      <div className="space-y-4 bg-black/60 p-4 rounded-xl border border-brand-gold/30">
                        <div className="flex justify-between items-center pb-2 border-b border-white/10">
                          <span className="font-mono text-[9px] text-brand-gold uppercase font-bold">Selected Patron</span>
                          <button 
                            type="button"
                            onClick={() => setSelectedPatronEmail(null)}
                            className="p-1 text-stone-400 hover:text-white cursor-pointer"
                          >
                            <X className="w-4 h-4" />
                          </button>
                        </div>

                        {accounts.filter(a => a.email === selectedPatronEmail).map((acc) => (
                          <div key={acc.email} className="space-y-3.5 text-xs">
                            <div>
                              <strong className="text-white text-sm block">{acc.name}</strong>
                              <span className="font-mono text-[11px] text-stone-400 block">{acc.email}</span>
                            </div>

                            <div className="flex items-center justify-between font-mono bg-black p-2.5 rounded-lg border border-white/10">
                              <span className="text-stone-400">Current Balance:</span>
                              <strong className="text-brand-gold text-sm font-bold">{acc.points || 0} pts</strong>
                            </div>

                            <div className="space-y-1.5">
                              <label className="font-mono text-[10px] uppercase text-stone-400 font-bold block">Points Value to Adjust</label>
                              <input
                                type="number"
                                value={pointsChangeAmount}
                                onChange={(e) => setPointsChangeAmount(e.target.value)}
                                className="w-full bg-black border border-white/10 rounded-lg p-2.5 text-xs text-brand-gold font-mono font-bold focus:outline-none focus:border-brand-gold"
                              />
                            </div>

                            <div className="space-y-1.5">
                              <label className="font-mono text-[10px] uppercase text-stone-400 font-bold block">Reason / Audit Motivation</label>
                              <input
                                type="text"
                                value={pointsReason}
                                onChange={(e) => setPointsReason(e.target.value)}
                                placeholder="e.g. Stain treatment compensation"
                                className="w-full bg-black border border-white/10 rounded-lg p-2.5 text-xs text-white focus:outline-none focus:border-brand-gold"
                              />
                            </div>

                            <div className="grid grid-cols-2 gap-2 pt-2">
                              <button
                                type="button"
                                onClick={() => handleAdjustPoints(acc.email, 'add')}
                                className="py-2.5 bg-emerald-600 hover:bg-emerald-500 text-white font-bold uppercase font-mono text-xs rounded-xl cursor-pointer transition-all shadow-md"
                              >
                                + Award
                              </button>
                              <button
                                type="button"
                                onClick={() => handleAdjustPoints(acc.email, 'subtract')}
                                className="py-2.5 bg-red-800 hover:bg-red-700 text-white font-bold uppercase font-mono text-xs rounded-xl cursor-pointer transition-all shadow-md"
                              >
                                - Deduct
                              </button>
                            </div>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <div className="p-6 bg-black/40 rounded-xl border border-white/5 text-center text-xs text-stone-400 space-y-2">
                        <Award className="w-8 h-8 text-stone-600 mx-auto" />
                        <p>Select any patron from the directory to open points adjustment controls.</p>
                      </div>
                    )}
                  </div>

                </div>
              )}

              {/* TAB 3: FINANCIAL SETTLEMENT & OVERRIDES */}
              {activeTab === 'financials' && (
                <div className="bg-[#161616] p-6 rounded-2xl border border-white/10 space-y-6">
                  <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 pb-4 border-b border-white/10">
                    <div>
                      <h4 className="font-serif text-lg font-light text-white flex items-center gap-2">
                        <Receipt className="w-5 h-5 text-emerald-400" />
                        <span>Financial Settlement & Payment Overrides</span>
                      </h4>
                      <p className="font-sans text-xs text-stone-400 font-light mt-0.5">
                        Inspect order costs, toggle payment overrides, and issue administrative receipts.
                      </p>
                    </div>

                    <div className="flex items-center gap-3">
                      <div className="px-3 py-1.5 bg-emerald-500/10 border border-emerald-500/30 rounded-xl font-mono text-xs text-emerald-400">
                        Total Revenue: <strong>₵{totalRevenue}.00 GHS</strong>
                      </div>
                    </div>
                  </div>

                  <div className="space-y-4">
                    {activeBookings.map((b) => (
                      <div
                        key={b.id}
                        className="p-4 bg-black/40 rounded-xl border border-white/10 flex flex-col md:flex-row justify-between items-start md:items-center gap-4 text-xs"
                      >
                        <div className="space-y-1">
                          <div className="flex items-center space-x-2">
                            <span className="font-mono text-brand-gold font-bold px-1.5 py-0.5 bg-brand-gold/10 rounded">{b.id}</span>
                            <strong className="text-white text-sm">{b.name}</strong>
                          </div>
                          <span className="text-stone-400 text-xs block">{b.serviceType} • {b.suburb} ({b.address})</span>
                          {b.transactionRef && (
                            <span className="font-mono text-[10px] text-stone-500 block">Hash: {b.transactionRef}</span>
                          )}
                        </div>

                        <div className="flex items-center gap-4 self-end md:self-auto">
                          <div className="text-right">
                            <span className="text-stone-400 text-[10px] font-mono block">Order Amount</span>
                            <strong className="text-white text-sm font-mono">₵{b.amount || 50}.00 GHS</strong>
                          </div>

                          <button
                            type="button"
                            onClick={() => handleTogglePaymentStatus(b.id)}
                            className={`px-3 py-1.5 rounded-lg font-mono text-xs font-bold uppercase cursor-pointer border transition-all ${
                              b.paymentStatus === 'Paid'
                                ? 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30 hover:bg-emerald-500/30'
                                : 'bg-amber-500/20 text-amber-400 border-amber-500/30 hover:bg-amber-500/30'
                            }`}
                          >
                            {b.paymentStatus === 'Paid' ? '✓ PAID' : 'MARK PAID'}
                          </button>

                          <button
                            type="button"
                            onClick={() => setReceiptModalBooking(b)}
                            className="p-2 bg-white/5 hover:bg-white/15 text-stone-300 rounded-lg font-mono text-xs cursor-pointer border border-white/10 transition-all"
                            title="View Itemized Receipt"
                          >
                            <Printer className="w-4 h-4" />
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* TAB 4: SYSTEM SETTINGS & AUDIT LOGS */}
              {activeTab === 'settings' && (
                <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
                  
                  {/* Left: Supervisor Passcode Settings (Col 5) */}
                  <div className="lg:col-span-5 bg-[#161616] p-6 rounded-2xl border border-white/10 space-y-5">
                    <div className="pb-3 border-b border-white/10">
                      <h4 className="font-serif text-base font-light text-white flex items-center gap-2">
                        <Key className="w-4 h-4 text-brand-gold" />
                        <span>Supervisor Security Credentials</span>
                      </h4>
                      <p className="font-sans text-xs text-stone-400 font-light mt-0.5">
                        Configure master supervisor desk PIN code.
                      </p>
                    </div>

                    {passcodeSuccessMsg && (
                      <div className="p-3 bg-emerald-500/10 border border-emerald-500/30 text-emerald-400 rounded-xl text-xs">
                        {passcodeSuccessMsg}
                      </div>
                    )}

                    <form
                      onSubmit={(e) => {
                        e.preventDefault();
                        if (newPasscode.trim()) {
                          setSavedPasscode(newPasscode.trim());
                          setNewPasscode('');
                          setPasscodeSuccessMsg('Passcode updated successfully!');
                          logAuditAction('Passcode Update', 'Master supervisor PIN updated', 'system');
                          setTimeout(() => setPasscodeSuccessMsg(''), 3000);
                        }
                      }}
                      className="space-y-4 text-xs"
                    >
                      <div className="space-y-1.5">
                        <label className="font-mono text-[10px] uppercase text-stone-400 font-bold block">Current Passcode</label>
                        <input
                          type="text"
                          disabled
                          value={savedPasscode}
                          className="w-full bg-black/50 border border-white/10 rounded-xl p-2.5 text-stone-400 font-mono"
                        />
                      </div>

                      <div className="space-y-1.5">
                        <label className="font-mono text-[10px] uppercase text-stone-400 font-bold block">New Passcode PIN</label>
                        <input
                          type="password"
                          value={newPasscode}
                          onChange={(e) => setNewPasscode(e.target.value)}
                          placeholder="Enter new PIN (e.g. 9988)"
                          className="w-full bg-black border border-white/10 rounded-xl p-2.5 text-white font-mono focus:outline-none focus:border-brand-gold"
                        />
                      </div>

                      <button
                        type="submit"
                        className="w-full py-2.5 bg-brand-gold text-black rounded-xl text-xs font-mono font-bold uppercase tracking-wider hover:bg-brand-gold-light transition-all cursor-pointer"
                      >
                        Update Supervisor Passcode
                      </button>
                    </form>
                  </div>

                  {/* Right: Chronological Audit Logs (Col 7) */}
                  <div className="lg:col-span-7 bg-[#161616] p-6 rounded-2xl border border-white/10 space-y-5">
                    <div className="pb-3 border-b border-white/10 flex justify-between items-center">
                      <div>
                        <h4 className="font-serif text-base font-light text-white flex items-center gap-2">
                          <FileText className="w-4 h-4 text-brand-gold" />
                          <span>Audit Trail & Activity Log</span>
                        </h4>
                        <p className="font-sans text-xs text-stone-400 font-light mt-0.5">
                          Real-time chronological log of supervisor overrides.
                        </p>
                      </div>

                      <span className="font-mono text-[10px] text-brand-gold bg-brand-gold/10 px-2 py-0.5 rounded border border-brand-gold/20">
                        {auditLogs.length} Events
                      </span>
                    </div>

                    <div className="space-y-2.5 max-h-[350px] overflow-y-auto pr-1">
                      {auditLogs.map((log) => (
                        <div
                          key={log.id}
                          className="p-3 bg-black/40 rounded-xl border border-white/5 space-y-1 text-xs"
                        >
                          <div className="flex justify-between items-center text-[10px] font-mono">
                            <span className="text-brand-gold font-bold">{log.action}</span>
                            <span className="text-stone-500">{log.timestamp}</span>
                          </div>
                          <p className="text-stone-300 font-sans text-xs">{log.details}</p>
                          <span className="font-mono text-[9px] text-stone-500 block">By: {log.supervisor}</span>
                        </div>
                      ))}
                    </div>
                  </div>

                </div>
              )}

            </motion.div>
          )}

        </AnimatePresence>

        {/* Modal: Itemized Receipt Display */}
        <AnimatePresence>
          {receiptModalBooking && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="fixed inset-0 z-[120] bg-black/80 backdrop-blur-md flex items-center justify-center p-4"
            >
              <div className="bg-[#181818] border border-brand-gold/40 rounded-2xl max-w-md w-full p-6 text-left space-y-5 shadow-2xl relative">
                <button
                  type="button"
                  onClick={() => setReceiptModalBooking(null)}
                  className="absolute top-4 right-4 text-stone-400 hover:text-white"
                >
                  <X className="w-5 h-5" />
                </button>

                <div className="text-center space-y-1 pb-3 border-b border-white/10">
                  <span className="font-mono text-[9px] text-brand-gold uppercase tracking-widest block font-bold">FRESHFOLD BESPOKE TEXTILE CARE</span>
                  <h3 className="font-serif text-xl text-white">Itemized Receipt</h3>
                  <p className="text-[10px] font-mono text-stone-400">Order Ref: {receiptModalBooking.id} • Kumasi, Ghana</p>
                </div>

                <div className="space-y-3 font-sans text-xs">
                  <div className="flex justify-between text-stone-300">
                    <span>Client Name:</span>
                    <strong className="text-white">{receiptModalBooking.name}</strong>
                  </div>
                  <div className="flex justify-between text-stone-300">
                    <span>Service Tier:</span>
                    <strong className="text-white">{receiptModalBooking.serviceType}</strong>
                  </div>
                  <div className="flex justify-between text-stone-300">
                    <span>Pickup Suburb:</span>
                    <span className="text-stone-200">{receiptModalBooking.suburb} ({receiptModalBooking.address})</span>
                  </div>

                  <div className="pt-3 border-t border-white/10 space-y-2 font-mono text-xs">
                    <div className="flex justify-between text-stone-400">
                      <span>Base Care Package:</span>
                      <span>₵{(receiptModalBooking.amount || 50) - 10}.00 GHS</span>
                    </div>
                    <div className="flex justify-between text-stone-400">
                      <span>Express Dispatch Fee:</span>
                      <span>₵10.00 GHS</span>
                    </div>
                    <div className="flex justify-between text-white font-bold pt-2 border-t border-white/10 text-sm">
                      <span>Total Paid/Due:</span>
                      <span className="text-brand-gold">₵{receiptModalBooking.amount || 50}.00 GHS</span>
                    </div>
                  </div>

                  <div className="p-3 bg-black/50 rounded-xl border border-white/5 text-[10px] font-mono text-stone-400 flex justify-between items-center">
                    <span>Payment Status:</span>
                    <span className={`px-2 py-0.5 rounded font-bold uppercase ${receiptModalBooking.paymentStatus === 'Paid' ? 'bg-emerald-500/20 text-emerald-400' : 'bg-amber-500/20 text-amber-400'}`}>
                      {receiptModalBooking.paymentStatus || 'Pending / COD'}
                    </span>
                  </div>
                </div>

                <button
                  type="button"
                  onClick={() => {
                    window.print();
                  }}
                  className="w-full py-2.5 bg-brand-sage text-white rounded-xl text-xs font-bold uppercase tracking-wider hover:bg-brand-sage-light transition-all cursor-pointer font-mono flex items-center justify-center gap-1.5"
                >
                  <Receipt className="w-4 h-4" /> Print / Save PDF Receipt
                </button>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

      </div>
    </div>
  );
}
