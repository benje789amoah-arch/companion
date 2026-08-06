/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState } from 'react';
import { 
  Laptop, 
  MapPin, 
  Layers, 
  Truck, 
  User, 
  TrendingUp, 
  Zap, 
  Send, 
  Plus, 
  AlertTriangle, 
  CheckCircle, 
  Clock, 
  UserCheck, 
  Activity, 
  RefreshCw 
} from 'lucide-react';
import { Order, RiderState, Message, Notification } from '../types';

interface AdminConsoleProps {
  rider: RiderState;
  orders: Order[];
  messages: Message[];
  onDispatchOrder: (orderId: string) => void;
  onInjectNewOrder: (order: Order) => void;
  onSendMessage: (sender: 'dispatcher' | 'customer', text: string) => void;
  onUpdateRiderState: (updates: Partial<RiderState>) => void;
  onResetSimulation: () => void;
}

export default function AdminConsole({
  rider,
  orders,
  messages,
  onDispatchOrder,
  onInjectNewOrder,
  onSendMessage,
  onUpdateRiderState,
  onResetSimulation,
}: AdminConsoleProps) {
  const [chatSender, setChatSender] = useState<'dispatcher' | 'customer'>('dispatcher');
  const [chatText, setChatText] = useState('');
  
  // Custom order form
  const [custName, setCustName] = useState('');
  const [custAddress, setCustAddress] = useState('');
  const [priority, setPriority] = useState<'standard' | 'priority' | 'elite'>('priority');

  const handleSendChat = (e: React.FormEvent) => {
    e.preventDefault();
    if (!chatText.trim()) return;
    onSendMessage(chatSender, chatText);
    setChatText('');
  };

  const handleInjectOrder = () => {
    if (!custName.trim() || !custAddress.trim()) return;
    
    const randomId = `order-${Date.now()}`;
    const randomNum = `FF-${Math.floor(1000 + Math.random() * 9000)}-${priority.toUpperCase()}`;
    
    // Generate random coordinates near the central KNUST grid
    const rx = 20 + Math.floor(Math.random() * 60);
    const ry = 20 + Math.floor(Math.random() * 60);
    
    const newOrder: Order = {
      id: randomId,
      orderNumber: randomNum,
      customerName: custName,
      customerPhone: "+233 " + Math.floor(200 + Math.random() * 800) + " " + Math.floor(100 + Math.random() * 900) + " " + Math.floor(100 + Math.random() * 900),
      pickupAddress: custAddress,
      pickupCoords: { x: rx, y: ry, lat: 6.6745 + (ry - 50) / 10000, lng: -1.5716 + (rx - 50) / 10000 },
      deliveryAddress: "FreshFold Laundry Hub (KNUST Commercial Area)",
      deliveryCoords: { x: 50, y: 50, lat: 6.6745, lng: -1.5716 },
      laundryType: "Luxury Linen & Bedding Collection",
      bagCount: 2,
      bags: [
        { id: `BAG-${randomId}-1`, type: "Luxury Linen Silk Mix", weight: "2.4kg", itemCount: 5, qrCode: `FF-BAG-${randomNum}-1`, scanned: false },
        { id: `BAG-${randomId}-2`, type: "Plush Microfiber Robes", weight: "3.2kg", itemCount: 4, qrCode: `FF-BAG-${randomNum}-2`, scanned: false }
      ],
      priority,
      status: 'unassigned',
      distance: parseFloat((1.5 + Math.random() * 3).toFixed(1)),
      estDuration: Math.floor(6 + Math.random() * 12),
      price: priority === 'elite' ? 95.00 : priority === 'priority' ? 55.00 : 30.00,
      deadline: "Within 2 hours",
      specialInstructions: "FreshFold white-glove treatment requested. Ensure custom linen garment covers are active."
    };

    onInjectNewOrder(newOrder);
    setCustName('');
    setCustAddress('');
  };

  // Dispatch unassigned orders
  const unassignedOrders = orders.filter(o => o.status === 'unassigned');
  const activeOrders = orders.filter(o => o.status !== 'unassigned' && o.status !== 'delivered' && o.status !== 'cancelled');
  const completedOrders = orders.filter(o => o.status === 'delivered');

  return (
    <div className="flex flex-col h-full bg-bg-linen border-r border-border-soft overflow-y-auto p-6 space-y-6" id="dispatcher-control-console">
      {/* Title Header */}
      <div className="flex items-center justify-between border-b border-border-soft pb-4">
        <div className="flex items-center space-x-3">
          <div className="w-10 h-10 bg-brand-sage rounded-xl flex items-center justify-center shadow-xs">
            <Laptop className="w-5 h-5 text-white" />
          </div>
          <div>
            <div className="flex items-center space-x-1.5">
              <span className="text-[10px] font-mono tracking-widest text-brand-sage font-bold uppercase">FreshFold Co.</span>
              <span className="w-1.5 h-1.5 bg-status-success rounded-full animate-ping"></span>
            </div>
            <h1 className="text-lg font-bold text-text-charcoal font-display leading-tight">HQ Dispatcher Control Panel</h1>
          </div>
        </div>

        <button 
          onClick={onResetSimulation}
          className="flex items-center space-x-1.5 px-3 py-1.5 border border-border-soft rounded-lg bg-white hover:bg-bg-ivory text-[11px] font-semibold text-text-charcoal active:scale-95 transition-all shadow-xs"
        >
          <RefreshCw className="w-3.5 h-3.5 text-brand-sage" />
          <span>Reset Sim</span>
        </button>
      </div>

      {/* METRICS ROW (Bento Grid Style - Natural Tones) */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {/* Metric 1 */}
        <div className="bg-white p-5 rounded-[20px] border border-border-soft flex flex-col justify-between shadow-xs hover:shadow-md transition-all duration-300">
          <div className="flex justify-between items-center text-text-slate mb-2">
            <span className="text-[10px] font-bold tracking-wider uppercase font-display">Riders Online</span>
            <UserCheck className="w-4 h-4 text-brand-sage" />
          </div>
          <div>
            <h4 className="text-2xl font-semibold text-text-charcoal font-display leading-none">{rider.isOnline ? "1 Active" : "0 Active"}</h4>
            <p className="text-[10px] text-text-slate mt-1.5">{rider.name}: {rider.isOnline ? "Online" : "Offline"}</p>
          </div>
        </div>

        {/* Metric 2 */}
        <div className="bg-white p-5 rounded-[20px] border border-border-soft flex flex-col justify-between shadow-xs hover:shadow-md transition-all duration-300">
          <div className="flex justify-between items-center text-text-slate mb-2">
            <span className="text-[10px] font-bold tracking-wider uppercase font-display">Active Load</span>
            <Truck className="w-4 h-4 text-brand-gold" />
          </div>
          <div>
            <h4 className="text-2xl font-semibold text-text-charcoal font-display leading-none">{activeOrders.length} Orders</h4>
            <p className="text-[10px] text-text-slate mt-1.5">{unassignedOrders.length} in backlog queue</p>
          </div>
        </div>

        {/* Metric 3 */}
        <div className="bg-white p-5 rounded-[20px] border border-border-soft flex flex-col justify-between shadow-xs hover:shadow-md transition-all duration-300">
          <div className="flex justify-between items-center text-text-slate mb-2">
            <span className="text-[10px] font-bold tracking-wider uppercase font-display">On-Time rate</span>
            <Clock className="w-4 h-4 text-status-success" />
          </div>
          <div>
            <h4 className="text-2xl font-semibold text-text-charcoal font-display leading-none">{rider.onTimeRate}%</h4>
            <p className="text-[10px] text-text-slate mt-1.5">Acceptance: {rider.acceptanceRate}%</p>
          </div>
        </div>

        {/* Metric 4 */}
        <div className="bg-white p-5 rounded-[20px] border border-border-soft flex flex-col justify-between shadow-xs hover:shadow-md transition-all duration-300">
          <div className="flex justify-between items-center text-text-slate mb-2">
            <span className="text-[10px] font-bold tracking-wider uppercase font-display">KPI Efficiency</span>
            <TrendingUp className="w-4 h-4 text-status-info" />
          </div>
          <div>
            <h4 className="text-2xl font-semibold text-text-charcoal font-display leading-none">99.2%</h4>
            <p className="text-[10px] text-text-slate mt-1.5">Elite SLA target: 98%</p>
          </div>
        </div>
      </div>

      {/* DISPATCH AND INJECT CONTROL COLUMNS */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        
        {/* Left Col: Order Dispatching Backlog */}
        <div className="bg-white rounded-xl border border-border-soft p-5 flex flex-col space-y-4 shadow-xs">
          <div className="flex justify-between items-center border-b border-border-soft pb-2">
            <h3 className="text-xs font-bold uppercase tracking-widest text-text-charcoal font-display flex items-center space-x-1.5">
              <Layers className="w-4 h-4 text-brand-sage" />
              <span>Backlog Dispatch Queue ({unassignedOrders.length})</span>
            </h3>
          </div>

          {unassignedOrders.length === 0 ? (
            <div className="py-8 text-center text-text-slate">
              <CheckCircle className="w-8 h-8 text-status-success/30 mx-auto mb-2" />
              <p className="text-xs font-semibold">Backlog completely dispatched</p>
              <p className="text-[10px]">Use the injector to add more concierge orders.</p>
            </div>
          ) : (
            <div className="space-y-3 max-h-60 overflow-y-auto pr-1">
              {unassignedOrders.map((order) => (
                <div 
                  key={order.id} 
                  className={`p-3 rounded-lg border transition-all ${
                    order.priority === 'elite' ? 'border-brand-gold/40 bg-brand-gold/5' : 'border-border-soft bg-bg-ivory'
                  }`}
                >
                  <div className="flex justify-between items-start">
                    <div>
                      <div className="flex items-center space-x-2">
                        <span className="text-xs font-bold text-text-charcoal">{order.customerName}</span>
                        <span className={`text-[8px] font-mono px-1.5 py-0.5 rounded-sm font-bold uppercase ${
                          order.priority === 'elite' ? 'bg-brand-gold/20 text-brand-gold' : 
                          order.priority === 'priority' ? 'bg-brand-sage/10 text-brand-sage' : 
                          'bg-border-soft text-text-slate'
                        }`}>
                          {order.priority}
                        </span>
                      </div>
                      <p className="text-[10px] text-text-slate mt-1">{order.pickupAddress}</p>
                      <p className="text-[9px] text-text-slate mt-0.5 font-mono">{order.laundryType} ({order.bagCount} bags)</p>
                    </div>

                    <button
                      onClick={() => onDispatchOrder(order.id)}
                      disabled={!rider.isOnline}
                      className="px-3 py-1.5 bg-brand-sage hover:bg-brand-sage/95 disabled:bg-border-soft disabled:text-text-slate text-white text-[10px] font-bold rounded-lg transition-all shadow-xs active:scale-95 shrink-0"
                    >
                      Dispatch Now
                    </button>
                  </div>
                  {!rider.isOnline && (
                    <p className="text-[8.5px] text-status-error/85 font-semibold mt-1.5 flex items-center space-x-1">
                      <AlertTriangle className="w-3 h-3 shrink-0" />
                      <span>Rider must be ONLINE to assign.</span>
                    </p>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Right Col: Luxury Order Injector Form */}
        <div className="bg-white rounded-xl border border-border-soft p-5 flex flex-col space-y-4 shadow-xs">
          <h3 className="text-xs font-bold uppercase tracking-widest text-text-charcoal font-display flex items-center space-x-1.5 border-b border-border-soft pb-2">
            <Plus className="w-4 h-4 text-brand-gold" />
            <span>Simulate New Concierge Request</span>
          </h3>

          <div className="space-y-3 text-xs">
            <div>
              <label className="block text-[10px] font-bold uppercase text-text-slate mb-1">Customer Name</label>
              <input
                type="text"
                value={custName}
                onChange={e => setCustName(e.target.value)}
                placeholder="e.g. Abena Osei"
                className="w-full p-2 border border-border-soft rounded-lg focus:outline-none focus:border-brand-sage bg-bg-ivory text-text-charcoal"
              />
            </div>

            <div>
              <label className="block text-[10px] font-bold uppercase text-text-slate mb-1">Pickup Location (KNUST Address)</label>
              <input
                type="text"
                value={custAddress}
                onChange={e => setCustAddress(e.target.value)}
                placeholder="e.g. Unity Hall, Block C, Room 102"
                className="w-full p-2 border border-border-soft rounded-lg focus:outline-none focus:border-brand-sage bg-bg-ivory text-text-charcoal"
              />
            </div>

            <div className="flex space-x-3">
              <div className="flex-1">
                <label className="block text-[10px] font-bold uppercase text-text-slate mb-1">Priority Tier</label>
                <select
                  value={priority}
                  onChange={e => setPriority(e.target.value as any)}
                  className="w-full p-2 border border-border-soft rounded-lg focus:outline-none focus:border-brand-sage bg-bg-ivory text-text-charcoal text-xs"
                >
                  <option value="standard">Standard Care</option>
                  <option value="priority">Priority Express</option>
                  <option value="elite">Elite VIP Gold</option>
                </select>
              </div>

              <div className="flex items-end">
                <button
                  type="button"
                  onClick={handleInjectOrder}
                  disabled={!custName.trim() || !custAddress.trim()}
                  className="w-full py-2 px-4 bg-brand-sage hover:bg-brand-sage/95 disabled:opacity-40 disabled:hover:bg-brand-sage text-white font-bold rounded-lg transition-all active:scale-95 shadow-xs flex items-center justify-center space-x-1.5 h-[34px]"
                >
                  <Plus className="w-3.5 h-3.5" />
                  <span>Create Request</span>
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* RIDER REAL-TIME METRICS & TELEMETRY */}
      <div className="bg-white rounded-xl border border-border-soft p-5 shadow-xs flex flex-col space-y-4">
        <h3 className="text-xs font-bold uppercase tracking-widest text-text-charcoal font-display flex items-center space-x-1.5 border-b border-border-soft pb-2">
          <Activity className="w-4 h-4 text-brand-sage" />
          <span>{rider.name || 'Unregistered Rider'} — Real-Time Telemetry</span>
        </h3>

        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 text-xs">
          {/* Battery Adjuster */}
          <div className="bg-bg-ivory p-3 rounded-lg border border-border-soft">
            <div className="flex justify-between items-center mb-1">
              <span className="text-[10px] uppercase font-bold text-text-slate">Scooter Battery</span>
              <span className="text-brand-sage font-bold font-mono">{rider.batteryLevel}%</span>
            </div>
            <input
              type="range"
              min="10"
              max="100"
              value={rider.batteryLevel}
              onChange={e => onUpdateRiderState({ batteryLevel: parseInt(e.target.value) })}
              className="w-full accent-brand-sage cursor-pointer"
            />
          </div>

          {/* Speed Adjuster */}
          <div className="bg-bg-ivory p-3 rounded-lg border border-border-soft">
            <div className="flex justify-between items-center mb-1">
              <span className="text-[10px] uppercase font-bold text-text-slate">Scooter Speed</span>
              <span className="text-brand-sage font-bold font-mono">{rider.speed} km/h</span>
            </div>
            <input
              type="range"
              min="0"
              max="60"
              value={rider.speed}
              onChange={e => onUpdateRiderState({ speed: parseInt(e.target.value) })}
              className="w-full accent-brand-sage cursor-pointer"
            />
          </div>

          {/* GPS Accuracy Adjuster */}
          <div className="bg-bg-ivory p-3 rounded-lg border border-border-soft">
            <div className="flex justify-between items-center mb-1">
              <span className="text-[10px] uppercase font-bold text-text-slate">GPS Accuracy</span>
              <span className="text-brand-sage font-bold font-mono">±{rider.gpsAccuracy}m</span>
            </div>
            <input
              type="range"
              min="1"
              max="20"
              step="0.5"
              value={rider.gpsAccuracy}
              onChange={e => onUpdateRiderState({ gpsAccuracy: parseFloat(e.target.value) })}
              className="w-full accent-brand-sage cursor-pointer"
            />
          </div>

          {/* Rapid trigger: Force Traffic Delay */}
          <div className="flex items-center justify-center p-2">
            <button
              onClick={() => {
                onSendMessage('dispatcher', "⚠️ Traffic delays reported on Broadway. High accuracy rerouting advised.");
                onUpdateRiderState({ speed: 12 });
              }}
              className="w-full py-2.5 px-3 border border-status-warning/40 bg-status-warning/5 hover:bg-status-warning/10 text-status-warning text-[10px] font-bold rounded-lg uppercase tracking-wider flex items-center justify-center space-x-1.5 transition-all active:scale-95"
            >
              <AlertTriangle className="w-3.5 h-3.5" />
              <span>Simulate Traffic Delay</span>
            </button>
          </div>
        </div>
      </div>

      {/* DISPATCHER & CUSTOMER CHAT SIMULATOR */}
      <div className="bg-white rounded-xl border border-border-soft p-5 shadow-xs flex flex-col space-y-4">
        <div className="flex justify-between items-center border-b border-border-soft pb-2">
          <h3 className="text-xs font-bold uppercase tracking-widest text-text-charcoal font-display flex items-center space-x-1.5">
            <Send className="w-4 h-4 text-brand-sage" />
            <span>Interactive Chat Sync Controller</span>
          </h3>

          <div className="flex space-x-2 bg-bg-linen p-0.5 rounded-lg text-[9px] font-semibold">
            <button
              type="button"
              onClick={() => setChatSender('dispatcher')}
              className={`px-2 py-0.5 rounded-md transition-all ${chatSender === 'dispatcher' ? 'bg-white text-text-charcoal' : 'text-text-slate'}`}
            >
              As Dispatcher
            </button>
            <button
              type="button"
              onClick={() => setChatSender('customer')}
              className={`px-2 py-0.5 rounded-md transition-all ${chatSender === 'customer' ? 'bg-white text-text-charcoal' : 'text-text-slate'}`}
            >
              As Customer
            </button>
          </div>
        </div>

        {/* Chat History Box */}
        <div className="h-32 overflow-y-auto border border-border-soft rounded-lg bg-bg-ivory/50 p-3 space-y-2 flex flex-col-reverse">
          {[...messages].reverse().map((msg) => (
            <div 
              key={msg.id} 
              className={`flex flex-col max-w-[80%] p-2 rounded-lg text-[10.5px] leading-tight ${
                msg.sender === 'rider' ? 'self-end bg-brand-sage/10 border border-brand-sage/20 text-text-charcoal' : 
                msg.sender === 'dispatcher' ? 'self-start bg-white border border-border-soft text-text-charcoal' :
                'self-start bg-brand-gold/10 border border-brand-gold/20 text-text-charcoal'
              }`}
            >
              <div className="flex items-center space-x-1 text-[8px] font-bold text-text-slate uppercase tracking-wider mb-0.5">
                <span>{msg.sender}</span>
                <span>•</span>
                <span>{msg.timestamp}</span>
              </div>
              <p>{msg.text}</p>
            </div>
          ))}
        </div>

        {/* Chat input form */}
        <form onSubmit={handleSendChat} className="flex space-x-2">
          <input
            type="text"
            value={chatText}
            onChange={e => setChatText(e.target.value)}
            placeholder={`Type as ${chatSender}...`}
            className="flex-grow p-2 border border-border-soft rounded-lg bg-bg-ivory text-xs focus:outline-none focus:border-brand-sage"
          />
          <button
            type="submit"
            className="px-3 bg-brand-sage text-white rounded-lg flex items-center justify-center active:scale-95 transition-all shadow-xs"
          >
            <Send className="w-3.5 h-3.5" />
          </button>
        </form>
      </div>

      {/* COMPLETED JOBS AUDIT LOG */}
      <div className="bg-white rounded-xl border border-border-soft p-5 shadow-xs flex flex-col space-y-3">
        <h3 className="text-xs font-bold uppercase tracking-widest text-text-charcoal font-display flex items-center space-x-1.5 border-b border-border-soft pb-2">
          <CheckCircle className="w-4 h-4 text-status-success" />
          <span>Concierge Proof & Audit Logs</span>
        </h3>

        {completedOrders.length === 0 ? (
          <p className="text-text-slate text-[10.5px] text-center py-4">No signatures or proof documents uploaded yet today.</p>
        ) : (
          <div className="space-y-3 max-h-48 overflow-y-auto">
            {completedOrders.map((order) => (
              <div key={order.id} className="p-2.5 bg-bg-ivory border border-border-soft rounded-lg text-xs space-y-2">
                <div className="flex justify-between font-bold">
                  <span>{order.customerName}</span>
                  <span className="font-mono text-[10px] text-brand-sage">{order.orderNumber}</span>
                </div>
                
                <div className="grid grid-cols-2 gap-2">
                  {/* Pickup Info */}
                  <div className="p-1.5 bg-white border border-border-soft rounded-sm">
                    <p className="text-[8px] font-bold uppercase text-text-slate">Pickup Signature</p>
                    {order.pickupSignature ? (
                      <div className="text-[9px] text-status-success font-semibold mt-1 flex items-center space-x-1">
                        <CheckCircle className="w-3 h-3" />
                        <span>Verified Digital Slip</span>
                      </div>
                    ) : (
                      <span className="text-[9px] text-text-slate italic">Standard Bag Drop</span>
                    )}
                  </div>

                  {/* Delivery Info */}
                  <div className="p-1.5 bg-white border border-border-soft rounded-sm">
                    <p className="text-[8px] font-bold uppercase text-text-slate">Proof Photo</p>
                    {order.deliveryPhoto ? (
                      <div className="mt-1 relative h-10 w-full rounded-sm overflow-hidden border border-border-soft bg-black">
                        <img 
                          src={order.deliveryPhoto} 
                          alt="Proof" 
                          className="w-full h-full object-cover"
                          referrerPolicy="no-referrer"
                        />
                      </div>
                    ) : (
                      <span className="text-[9px] text-text-slate italic">Not uploaded</span>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
