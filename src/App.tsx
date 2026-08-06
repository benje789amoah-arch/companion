/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect } from 'react';
import { 
  RefreshCw, 
  CheckCircle,
  MessageSquare,
  Sliders
} from 'lucide-react';
import { Order, RiderState, Message, Notification, OrderStatus } from './types';
import { 
  INITIAL_RIDER, 
  INITIAL_ORDERS, 
  INITIAL_NOTIFICATIONS, 
  INITIAL_MESSAGES 
} from './data/mockData';
import PhoneSimulator from './components/PhoneSimulator';

export default function App() {
  // Sync state loaded from localStorage or default mockData
  const [rider, setRider] = useState<RiderState>(() => {
    const saved = localStorage.getItem('freshfold_rider');
    return saved ? JSON.parse(saved) : { ...INITIAL_RIDER };
  });

  const [orders, setOrders] = useState<Order[]>(() => {
    const saved = localStorage.getItem('freshfold_orders');
    return saved ? JSON.parse(saved) : [ ...INITIAL_ORDERS ];
  });

  const [messages, setMessages] = useState<Message[]>(() => {
    const saved = localStorage.getItem('freshfold_messages');
    return saved ? JSON.parse(saved) : [ ...INITIAL_MESSAGES ];
  });

  const [notifications, setNotifications] = useState<Notification[]>(() => {
    const saved = localStorage.getItem('freshfold_notifications');
    return saved ? JSON.parse(saved) : [ ...INITIAL_NOTIFICATIONS ];
  });

  const [simulationActive, setSimulationActive] = useState(false);
  const [viewMode, setViewMode] = useState<'split' | 'phone' | 'admin'>('split');
  const [activeTab, setActiveTab] = useState<'about' | 'workflow'>('about');

  // Prevent stale coordinates from localStorage (e.g. from previous New York / Soho session)
  useEffect(() => {
    const hasStaleRider = rider.coords && (rider.coords.lat > 10 || rider.coords.lat < 5 || rider.coords.lng > 0 || rider.coords.lng < -3);
    const hasStaleOrders = orders.some(o => o.pickupCoords && (o.pickupCoords.lat > 10 || o.pickupCoords.lat < 5));
    
    if (hasStaleRider || hasStaleOrders) {
      setRider({ ...INITIAL_RIDER });
      setOrders([ ...INITIAL_ORDERS ]);
      setNotifications([ ...INITIAL_NOTIFICATIONS ]);
      setMessages([ ...INITIAL_MESSAGES ]);
      localStorage.removeItem('freshfold_rider');
      localStorage.removeItem('freshfold_orders');
      localStorage.removeItem('freshfold_notifications');
      localStorage.removeItem('freshfold_messages');
    }
  }, []);

  // Save changes to local persistence
  useEffect(() => {
    localStorage.setItem('freshfold_rider', JSON.stringify(rider));
  }, [rider]);

  useEffect(() => {
    localStorage.setItem('freshfold_orders', JSON.stringify(orders));
  }, [orders]);

  useEffect(() => {
    localStorage.setItem('freshfold_messages', JSON.stringify(messages));
  }, [messages]);

  useEffect(() => {
    localStorage.setItem('freshfold_notifications', JSON.stringify(notifications));
  }, [notifications]);

  // Find active order assigned to this rider
  const activeOrder = orders.find(
    o => o.status !== 'unassigned' && o.status !== 'delivered' && o.status !== 'cancelled'
  );

  // Dispatch Action from Admin Dashboard
  const handleDispatchOrder = (orderId: string) => {
    setOrders(prev =>
      prev.map(o => (o.id === orderId ? { ...o, status: 'unassigned' } : o))
    );

    // Create popup alert for rider
    const targetOrder = orders.find(o => o.id === orderId);
    if (!targetOrder) return;

    const newNotif: Notification = {
      id: `notif-${Date.now()}`,
      title: "New Premium Pickup Request",
      body: `Incoming elite order from ${targetOrder.customerName}. Accept within 15 seconds.`,
      timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      type: 'order',
      orderId,
      read: false
    };

    setNotifications(prev => [newNotif, ...prev]);

    // Force rider state order assign (rider accepts later)
    // We update status to unassigned to float into the rider's queue
  };

  // Accept Order from Rider Device
  const handleAcceptOrder = (orderId: string) => {
    setOrders(prev =>
      prev.map(o => (o.id === orderId ? { ...o, status: 'assigned' } : o))
    );

    // Notify customer
    const targetOrder = orders.find(o => o.id === orderId);
    if (!targetOrder) return;

    const dispatchMsg: Message = {
      id: `msg-${Date.now()}`,
      sender: 'dispatcher',
      text: `${rider.name || 'Rider'} on ${rider.vehicle || 'Scooter'} (${rider.vehiclePlate || 'N/A'}) has accepted your contract and is preparing transit.`,
      timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      orderId
    };

    setMessages(prev => [...prev, dispatchMsg]);
  };

  // Decline Order from Rider Device
  const handleDeclineOrder = (orderId: string) => {
    setOrders(prev =>
      prev.map(o => (o.id === orderId ? { ...o, status: 'unassigned' } : o))
    );

    const alertNotif: Notification = {
      id: `notif-${Date.now()}`,
      title: "Order Returned to Backlog",
      body: `${rider.name || 'The rider'} declined order ${orderId}. Re-dispatch initiated.`,
      timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      type: 'alert',
      read: false
    };

    setNotifications(prev => [alertNotif, ...prev]);
  };

  // Update Order Status sequentially
  const handleUpdateOrderStatus = (
    orderId: string, 
    status: OrderStatus, 
    photo?: string, 
    sig?: string
  ) => {
    setOrders(prev =>
      prev.map(o => {
        if (o.id === orderId) {
          const updated = { ...o, status };
          if (photo) {
            if (status === 'pickup_scanned') updated.pickupPhoto = photo;
            else updated.deliveryPhoto = photo;
          }
          if (sig) {
            if (status === 'picked_up') updated.pickupSignature = sig;
            else updated.deliverySignature = sig;
          }
          return updated;
        }
        return o;
      })
    );

    // Inject matching messages automatically to feel alive
    const targetOrder = orders.find(o => o.id === orderId);
    if (!targetOrder) return;

    let text = '';
    if (status === 'navigating_to_pickup') {
      text = `${rider.name || 'Rider'} is navigating to KNUST Area Pickup Address: ${targetOrder.pickupAddress}.`;
    } else if (status === 'arrived_at_pickup') {
      text = `${rider.name || 'Rider'} has arrived outside. Preparing deluxe canvas bag validation scans.`;
    } else if (status === 'picked_up') {
      text = `Pristine pickup documented and confirmed. ${rider.name || 'Rider'} is securing garments on the scooter for transit to the Central Hub.`;
    } else if (status === 'navigating_to_laundry') {
      text = `Rider is traveling towards FreshFold Central Hub.`;
    } else if (status === 'dropped_off') {
      text = `Garments checked in successfully at sterilization hub. Beginning meticulous organic cleaning process.`;
    } else if (status === 'navigating_to_delivery') {
      text = `Scent-infused clean garments are packaged and transit is active. ${rider.name || 'Rider'} is navigating to delivery point.`;
    } else if (status === 'delivered') {
      text = `Concierge delivery complete. Garments handed off beautifully. Thank you for choosing FreshFold.`;
    }

    if (text) {
      const liveMsg: Message = {
        id: `msg-${Date.now()}`,
        sender: 'dispatcher',
        text,
        timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
        orderId
      };
      setMessages(prev => [...prev, liveMsg]);
    }
  };

  // Send message from Rider companion app
  const handleSendRiderMessage = (text: string) => {
    const newMsg: Message = {
      id: `msg-rider-${Date.now()}`,
      sender: 'rider',
      text,
      timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      orderId: activeOrder?.id
    };
    setMessages(prev => [...prev, newMsg]);

    // Simulate dispatcher automatically replying after 3 seconds
    setTimeout(() => {
      let replyText = "Copy that. Operational details synchronized with the Admin Dashboard.";
      if (text.toLowerCase().includes("arrived") || text.toLowerCase().includes("lobby")) {
        replyText = "Understood. The customer has been alerted and will receive you in the lounge. Safe handling requested.";
      } else if (text.toLowerCase().includes("delay") || text.toLowerCase().includes("traffic")) {
        replyText = "Coordinates received. ETA updated in customer client portal. Continue with caution.";
      } else if (text.toLowerCase().includes("sig") || text.toLowerCase().includes("otp")) {
        replyText = "Digital receipt ledger is open. Signature received successfully.";
      }

      const replyMsg: Message = {
        id: `msg-dispatcher-${Date.now()}`,
        sender: 'dispatcher',
        text: replyText,
        timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
        orderId: activeOrder?.id
      };
      setMessages(prev => [...prev, replyMsg]);

      // Float new message notification
      const newNotif: Notification = {
        id: `notif-chat-${Date.now()}`,
        title: "New Dispatch Message",
        body: replyText,
        timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
        type: 'message',
        read: false
      };
      setNotifications(prev => [newNotif, ...prev]);

    }, 3000);
  };

  // Send message from Admin Dashboard
  const handleSendAdminMessage = (sender: 'dispatcher' | 'customer', text: string) => {
    const newMsg: Message = {
      id: `msg-admin-${Date.now()}`,
      sender,
      text,
      timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      orderId: activeOrder?.id
    };
    setMessages(prev => [...prev, newMsg]);

    const newNotif: Notification = {
      id: `notif-admin-${Date.now()}`,
      title: sender === 'dispatcher' ? "Dispatch Alert" : "Customer Update",
      body: text,
      timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      type: sender === 'dispatcher' ? 'system' : 'message',
      read: false
    };
    setNotifications(prev => [newNotif, ...prev]);
  };

  // Inject Custom Order from Admin Console
  const handleInjectNewOrder = (newOrder: Order) => {
    setOrders(prev => [newOrder, ...prev]);
    
    const newNotif: Notification = {
      id: `notif-inject-${Date.now()}`,
      title: "Backlog Item Created",
      body: `New luxury order ${newOrder.orderNumber} for ${newOrder.customerName} added to dispatch backlog queue.`,
      timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      type: 'system',
      read: false
    };
    setNotifications(prev => [newNotif, ...prev]);
  };

  const handleUpdateRiderState = (updates: Partial<RiderState>) => {
    setRider(prev => ({ ...prev, ...updates }));
  };

  const handleMarkNotificationRead = (notifId: string) => {
    setNotifications(prev =>
      prev.map(n => (n.id === notifId ? { ...n, read: true } : n))
    );
  };

  // Generate beautiful random custom luxury orders for testing
  const handleGenerateRandomOrder = () => {
    const names = ["Prof. Acheampong", "Dr. Emmanuel Boateng", "Ama Serwaah", "Kofi Mensah", "Adwoa Osei", "Kwabena Appiah", "Abena Danso", "Nana Yaw Boateng"];
    const garments = ["Traditional Kente Cloth", "Premium Cotton Smock (Fugu)", "Delicate Hand-woven Lace Dress", "Academic Gown & Hood", "Linen Shirts & Designer Khakis", "Organic Cotton Bed Sheets"];
    const locations = ["Unity Hall (Conti), Block C", "University Hall (Katanga), Room 205", "Ayeduase Gate, Millennium Hostel", "Bomso, Jubilee Apartment Complex", "Kotei, Shalom Haven Residency", "Kentinkrono, Royal Park Gardens", "Republic Hall, Block A"];
    
    const randomName = names[Math.floor(Math.random() * names.length)];
    const randomGarment = garments[Math.floor(Math.random() * garments.length)];
    const randomLoc = locations[Math.floor(Math.random() * locations.length)];
    const randomPrice = Math.floor(Math.random() * 60) + 35;
    const randomDistance = parseFloat((Math.random() * 2 + 0.8).toFixed(1));
    const randomBags = Math.floor(Math.random() * 2) + 1;
    const orderNumStr = Math.floor(Math.random() * 9000) + 1000;

    const newOrder: Order = {
      id: `order-${Date.now()}`,
      orderNumber: `FF-${orderNumStr}-PREMIUM`,
      customerName: randomName,
      customerPhone: `+233 ${Math.floor(200 + Math.random() * 800)} ${Math.floor(100 + Math.random() * 900)} ${Math.floor(100 + Math.random() * 900)}`,
      pickupAddress: randomLoc,
      pickupCoords: { 
        x: Math.floor(Math.random() * 60) + 20, 
        y: Math.floor(Math.random() * 60) + 20, 
        lat: 6.6745 + (Math.random() * 0.02 - 0.01), 
        lng: -1.5716 + (Math.random() * 0.02 - 0.01) 
      },
      deliveryAddress: "FreshFold Laundry Hub (Commercial Area)",
      deliveryCoords: { x: 50, y: 50, lat: 6.6745, lng: -1.5716 },
      laundryType: randomGarment,
      bagCount: randomBags,
      bags: Array.from({ length: randomBags }).map((_, i) => ({
        id: `BAG-${orderNumStr}-${String.fromCharCode(65 + i)}`,
        type: i === 0 ? "Delicate Organics" : "Premium Textiles",
        weight: `${(Math.random() * 3 + 1).toFixed(1)}kg`,
        itemCount: Math.floor(Math.random() * 5) + 3,
        qrCode: `FF-BAG-${orderNumStr}-${String.fromCharCode(65 + i)}`,
        scanned: false
      })),
      priority: "elite",
      status: "unassigned",
      distance: randomDistance,
      estDuration: Math.round(randomDistance * 4),
      price: randomPrice,
      deadline: `Pickup by ${new Date(Date.now() + 45 * 60 * 1000).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`,
      specialInstructions: "Handle with white-glove standards. Place in individual organic cotton covers. Call upon arrival."
    };

    handleInjectNewOrder(newOrder);
  };

  const [showMobileSimHub, setShowMobileSimHub] = useState(false);

  // Active unassigned backlog orders
  const backlogOrders = orders.filter(o => o.status === 'unassigned');

  // Reset simulation to fresh state
  const handleResetSimulation = () => {
    localStorage.removeItem('freshfold_rider');
    localStorage.removeItem('freshfold_orders');
    localStorage.removeItem('freshfold_messages');
    localStorage.removeItem('freshfold_notifications');
    setRider({ ...INITIAL_RIDER });
    setOrders([ ...INITIAL_ORDERS ]);
    setMessages([ ...INITIAL_MESSAGES ]);
    setNotifications([ ...INITIAL_NOTIFICATIONS ]);
    setSimulationActive(false);
    setShowMobileSimHub(false);
  };

  return (
    <div className="h-screen h-[100dvh] w-screen bg-bg-ivory text-text-charcoal flex flex-col md:flex-row font-sans overflow-hidden" id="freshfold-root">
      
      {/* DESKTOP-ONLY SIDEBAR (Simulation Control Panel) */}
      <aside className="hidden md:flex flex-col md:w-[360px] lg:w-[420px] bg-white border-r border-border-soft overflow-y-auto shrink-0 z-10 p-6 shadow-sm">
        <div className="flex items-center gap-3 border-b border-border-soft pb-4 mb-5">
          <div className="w-9 h-9 bg-brand-sage rounded-full flex items-center justify-center text-white font-serif font-bold shadow-xs">
            <div className="w-3.5 h-3.5 border-2 border-white rounded-sm rotate-45"></div>
          </div>
          <div>
            <h1 className="text-sm font-extrabold tracking-wide text-text-charcoal uppercase font-display leading-none">FRESHFOLD CO.</h1>
            <p className="text-[10px] text-brand-gold font-bold tracking-widest uppercase leading-none mt-1">Dispatch Control Desk</p>
          </div>
        </div>

        {/* Quick Shift summary */}
        <div className="mb-6 bg-bg-linen p-4 rounded-[20px] border border-brand-stone/30">
          <h2 className="text-[10px] uppercase tracking-[0.2em] text-[#6B7280] font-bold mb-3">Rider Identity & Shift</h2>
          <div className="flex items-center gap-3">
            <img 
              src={rider.avatar || "https://images.unsplash.com/photo-1535713875002-d1d0cf377fde?auto=format&fit=crop&q=80&w=200"} 
              alt={rider.name || "Rider"} 
              className="w-10 h-10 rounded-full object-cover border border-brand-sage/40"
              referrerPolicy="no-referrer"
            />
            <div>
              <p className="text-xs font-bold text-text-charcoal">{rider.name || "No Driver Profile Setup"}</p>
              <p className="text-[10px] text-brand-gold font-bold uppercase tracking-wider italic">
                {rider.isOnline ? 'Active Online' : 'Currently Offline'}
              </p>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-2 mt-3 pt-3 border-t border-brand-stone/20 text-[10.5px]">
            <div>
              <span className="text-text-slate block">Today's Earnings</span>
              <span className="font-bold text-text-charcoal">GH₵ {rider.todayEarnings.toFixed(2)}</span>
            </div>
            <div>
              <span className="text-text-slate block">Completed Jobs</span>
              <span className="font-bold text-text-charcoal">{rider.completedCount} / 8</span>
            </div>
          </div>
        </div>

        {/* Dispatch Controls */}
        <div className="mb-6 flex flex-col space-y-3">
          <div className="flex justify-between items-center">
            <h2 className="text-[10px] uppercase tracking-[0.2em] text-[#6B7280] font-bold">Dispatch Backlog</h2>
            <button 
              onClick={handleGenerateRandomOrder}
              className="px-2 py-1 bg-brand-sage/10 text-brand-sage rounded-md text-[10px] font-bold hover:bg-brand-sage/15 transition-all flex items-center gap-1"
            >
              <CheckCircle className="w-3 h-3" />
              Generate Order
            </button>
          </div>

          <div className="space-y-2.5 max-h-[220px] overflow-y-auto pr-1">
            {backlogOrders.length === 0 ? (
              <div className="text-center py-6 border border-dashed border-border-soft rounded-2xl bg-bg-linen/40">
                <p className="text-[11px] text-text-slate">All premium jobs are dispatched.</p>
                <button 
                  onClick={handleGenerateRandomOrder}
                  className="mt-2 text-[10px] text-brand-gold font-bold underline hover:text-brand-gold/85"
                >
                  Generate a test contract
                </button>
              </div>
            ) : (
              backlogOrders.map(order => (
                <div key={order.id} className="bg-white border border-border-soft p-3.5 rounded-xl space-y-2 shadow-xs hover:border-brand-stone transition-all">
                  <div className="flex justify-between items-start">
                    <div>
                      <h4 className="text-xs font-bold text-text-charcoal leading-none">{order.customerName}</h4>
                      <p className="text-[9.5px] text-text-slate mt-0.5">{order.laundryType}</p>
                    </div>
                    <span className="text-xs font-bold text-status-success">GH₵ {order.price.toFixed(2)}</span>
                  </div>
                  <p className="text-[10px] text-text-slate leading-tight">{order.pickupAddress}</p>
                  <div className="flex justify-between items-center pt-1.5 border-t border-border-soft text-[10px]">
                    <span className="text-text-slate italic">{order.distance} km • {order.bagCount} bags</span>
                    <button
                      onClick={() => handleDispatchOrder(order.id)}
                      className="px-2.5 py-1 bg-brand-sage text-white rounded-md font-semibold hover:bg-brand-sage/95 active:scale-95 transition-all"
                    >
                      Dispatch Now
                    </button>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>

        {/* Action controls footer */}
        <div className="mt-auto pt-4 border-t border-border-soft space-y-2.5">
          <p className="text-[11px] text-text-slate leading-relaxed">
            This workspace presents the <span className="font-bold text-brand-sage">FreshFold Rider Companion App</span>. 
            On desktop, it is framed inside a luxury matte simulator; on mobile viewports, it operates at true edge-to-edge full screen.
          </p>
          <div className="grid grid-cols-2 gap-2">
            <button
              onClick={handleResetSimulation}
              className="py-2.5 bg-bg-linen hover:bg-brand-stone/30 text-text-charcoal rounded-xl text-xs font-semibold flex items-center justify-center gap-1.5 transition-all"
            >
              <RefreshCw className="w-3.5 h-3.5" />
              Reset Demo
            </button>
            <button
              onClick={() => {
                // Send simulated dispatcher prompt
                const msgs = [
                  `${rider.name || 'Rider'}, please ensure garment safety over the bridge route. High winds reported.`,
                  "Vice Chancellor lodge reports they added an organic protective coat garment to Bag B.",
                  "All riders check tire pressures on the scooter hub. Service standards apply today.",
                  "New elite shift guidelines are published under performance profiles."
                ];
                const randomMsg = msgs[Math.floor(Math.random() * msgs.length)];
                handleSendAdminMessage('dispatcher', randomMsg);
              }}
              className="py-2.5 bg-brand-sage/10 hover:bg-brand-sage/15 text-brand-sage rounded-xl text-xs font-semibold flex items-center justify-center gap-1.5 transition-all"
            >
              <MessageSquare className="w-3.5 h-3.5" />
              Mock Alert
            </button>
          </div>
        </div>
      </aside>

      {/* COMPANION MOBILE APP SCREEN CONTAINER */}
      <main className="flex-1 h-full flex flex-col items-center justify-center p-0 md:p-6 overflow-hidden md:overflow-y-auto bg-bg-linen relative">
        {/* Elegant premium dots pattern overlay (Desktop view only) */}
        <div className="absolute inset-0 opacity-[0.25] pointer-events-none hidden md:block" style={{ backgroundImage: 'radial-gradient(#6F7A63 1.5px, transparent 1.5px)', backgroundSize: '30px 30px' }}></div>
        
        {/* POLISHED FLOATING SIDE-HANDLE FOR MOBILE USERS (Simulation Trigger) */}
        <div className="fixed right-0 top-[30%] -translate-y-1/2 z-40 md:hidden">
          <button
            type="button"
            onClick={() => setShowMobileSimHub(true)}
            className="bg-brand-sage text-white py-3 px-2 rounded-l-xl shadow-xl flex flex-col items-center gap-1.5 border border-r-0 border-white/20 active:scale-95 transition-all"
            title="Open Simulation Hub"
          >
            <Sliders className="w-4 h-4" />
            <span className="text-[8px] font-extrabold tracking-widest leading-none flex flex-col items-center space-y-0.5">
              <span>S</span>
              <span>I</span>
              <span>M</span>
            </span>
          </button>
        </div>

        {/* MOBILE BOTTOM SLIDE-UP DRAWER (For mobile device testers to trigger dispatch actions) */}
        {showMobileSimHub && (
          <div className="fixed inset-0 bg-black/60 z-50 flex items-end justify-center md:hidden animate-fade-in" onClick={() => setShowMobileSimHub(false)}>
            <div 
              className="bg-white w-full rounded-t-[28px] p-6 max-h-[80vh] overflow-y-auto flex flex-col space-y-4"
              onClick={e => e.stopPropagation()}
            >
              {/* Drag Handle */}
              <div className="w-12 h-1 bg-brand-stone rounded-full mx-auto -mt-2 mb-2"></div>
              
              <div className="flex justify-between items-center">
                <div>
                  <h3 className="text-sm font-extrabold text-text-charcoal uppercase tracking-wider font-display">Conciérge Simulation Hub</h3>
                  <p className="text-[10px] text-text-slate">Simulate elite dispatch events on your mobile browser</p>
                </div>
                <button 
                  onClick={() => setShowMobileSimHub(false)}
                  className="text-text-slate font-bold text-xs bg-bg-linen p-1.5 px-3 rounded-full"
                >
                  Close
                </button>
              </div>

              {/* Backlog dispatcher list */}
              <div className="space-y-2 pt-2">
                <div className="flex justify-between items-center">
                  <span className="text-[10px] uppercase tracking-widest text-text-slate font-bold">Unassigned Queue ({backlogOrders.length})</span>
                  <button
                    onClick={handleGenerateRandomOrder}
                    className="text-[10px] text-brand-sage font-extrabold"
                  >
                    + Generate Mock
                  </button>
                </div>

                <div className="space-y-2 max-h-[180px] overflow-y-auto pr-1">
                  {backlogOrders.length === 0 ? (
                    <p className="text-[11px] text-text-slate text-center py-4 bg-bg-linen/40 rounded-xl">No unassigned orders. Generate a custom order above.</p>
                  ) : (
                    backlogOrders.map(order => (
                      <div key={order.id} className="bg-bg-linen/50 border border-border-soft p-3 rounded-xl flex justify-between items-center">
                        <div>
                          <p className="text-xs font-bold text-text-charcoal leading-none">{order.customerName}</p>
                          <p className="text-[9.5px] text-text-slate mt-0.5">{order.pickupAddress.split(',')[0]}</p>
                        </div>
                        <button
                          onClick={() => {
                            handleDispatchOrder(order.id);
                            setShowMobileSimHub(false);
                          }}
                          className="px-3 py-1 bg-brand-sage text-white text-[10px] font-bold rounded-lg"
                        >
                          Dispatch
                        </button>
                      </div>
                    ))
                  )}
                </div>
              </div>

              {/* General mobile mock buttons */}
              <div className="grid grid-cols-2 gap-3 pt-3 border-t border-border-soft">
                <button
                  onClick={handleResetSimulation}
                  className="py-3 bg-bg-linen hover:bg-brand-stone/30 text-text-charcoal rounded-xl text-xs font-bold flex items-center justify-center gap-1"
                >
                  <RefreshCw className="w-3.5 h-3.5" />
                  Reset State
                </button>
                <button
                  onClick={() => {
                    const msgs = [
                      `${rider.name || 'Rider'}, Vice Chancellor lodge needs verification signature upon arrivals.`,
                      "Severe storm alert south of Central Hub. Scooter safe-speeds mandatory.",
                      "FreshFold laundry hub has cleared sterilization backlog. Ready for delivery check-ins."
                    ];
                    const randomMsg = msgs[Math.floor(Math.random() * msgs.length)];
                    handleSendAdminMessage('dispatcher', randomMsg);
                    setShowMobileSimHub(false);
                  }}
                  className="py-3 bg-brand-sage/15 text-brand-sage rounded-xl text-xs font-bold flex items-center justify-center gap-1"
                >
                  <MessageSquare className="w-3.5 h-3.5" />
                  Trigger Alert
                </button>
              </div>
            </div>
          </div>
        )}

        <PhoneSimulator
          rider={rider}
          orders={orders}
          messages={messages}
          notifications={notifications}
          activeOrder={activeOrder}
          onUpdateRider={handleUpdateRiderState}
          onAcceptOrder={handleAcceptOrder}
          onDeclineOrder={handleDeclineOrder}
          onUpdateOrderStatus={handleUpdateOrderStatus}
          onSendRiderMessage={handleSendRiderMessage}
          onMarkNotificationRead={handleMarkNotificationRead}
          simulationActive={simulationActive}
          setSimulationActive={setSimulationActive}
        />
      </main>
    </div>
  );
}


