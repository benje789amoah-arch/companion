import React, { useState, useEffect } from 'react';
import { motion } from 'motion/react';
import { MapPin, Phone, Mail, Clock, Send, CheckCircle, Smartphone } from 'lucide-react';

export default function Contact() {
  const [inquiryName, setInquiryName] = useState('');
  const [inquiryEmail, setInquiryEmail] = useState('');
  const [inquiryMsg, setInquiryMsg] = useState('');
  const [formSent, setFormSent] = useState(false);
  const [isOpenNow, setIsOpenNow] = useState(true);

  // Dynamic Check to see if we are currently open (07:00 AM - 08:30 PM)
  useEffect(() => {
    const checkOpen = () => {
      const now = new Date();
      const hours = now.getUTCHours(); // Matches our system clock coordinates
      // Let's assume office is open from 7 AM UTC to 9 PM UTC
      if (hours >= 7 && hours < 21) {
        setIsOpenNow(true);
      } else {
        setIsOpenNow(false);
      }
    };
    checkOpen();
    const interval = setInterval(checkOpen, 60000);
    return () => clearInterval(interval);
  }, []);

  const handleSendInquiry = (e: React.FormEvent) => {
    e.preventDefault();
    if (!inquiryName || !inquiryMsg) {
      alert('Please fill out your name and the inquiry text.');
      return;
    }
    // Hands the enquiry to the visitor's own mail client. It used to do
    // nothing at all and then say it had been "routed to our Senior Artisan".
    const subject = encodeURIComponent(`Enquiry from ${inquiryName}`);
    const body = encodeURIComponent(
      `${inquiryMsg}

— ${inquiryName}${inquiryEmail ? ` (${inquiryEmail})` : ''}`
    );
    window.location.href = `mailto:laundry.freshfold@gmail.com?subject=${subject}&body=${body}`;

    setFormSent(true);
    setTimeout(() => {
      setInquiryName('');
      setInquiryEmail('');
      setInquiryMsg('');
      setFormSent(false);
    }, 4000);
  };

  // WhatsApp routing is hidden for now. The handler stays here so the button
  // below can be restored without rebuilding the message.
  // const triggerWhatsAppDirect = () => {
  //   const encoded = encodeURIComponent("Hello FreshFold! I'd like to ask a general question about your luxury dry care options.");
  //   window.open(`https://wa.me/233200957165?text=${encoded}`, '_blank');
  // };

  return (
    <section id="contact" className="py-24 bg-brand-charcoal relative border-b border-white/5">
      <div className="absolute bottom-0 right-0 w-[40%] h-[40%] rounded-full bg-brand-sage/5 blur-[150px] pointer-events-none" />

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 relative z-10">
        
        {/* Section Header */}
        <div className="max-w-3xl mx-auto text-center mb-16">
          <span className="font-sans text-[11px] uppercase tracking-[0.4em] text-brand-sage font-bold">
            Concierge Portal
          </span>
          <h2 className="font-serif text-3xl sm:text-5xl text-white font-light tracking-tight mt-3">
            Initiate Care <span className="font-serif italic text-brand-sage">& Communications</span>
          </h2>
          <p className="font-sans text-[#8E9299] text-sm mt-4 font-light tracking-wide max-w-xl mx-auto leading-relaxed">
            Connect with an active wardrobe specialist. Drop us a short message, drop by our physical Kiosk, or request a quick-schedule call on the hotline.
          </p>
        </div>

        {/* Contact info bento grid layout */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start" id="contact-bento">
          
          {/* LEFT: Quick Stats, Locations, Hours (Columns: 5) */}
          <div className="lg:col-span-5 space-y-6 text-left">
            
            {/* Live Operational State Widget */}
            <div className="bg-[#161616] p-6 rounded-2xl border border-white/10 relative overflow-hidden">
              <div className="flex items-center justify-between">
                <div>
                  <span className="font-mono text-[9px] tracking-wider text-[#8E9299]/70 block font-bold">
                    Concierge Dispatch Hub
                  </span>
                  <h4 className="font-serif text-xl font-light text-white mt-1.5">
                    Operating Hours
                  </h4>
                </div>
                <div className="flex items-center space-x-2 bg-black px-3 py-1.5 border border-white/10 rounded-xl font-sans text-xs text-stone-300">
                  <span className={`w-2 h-2 rounded-full ${isOpenNow ? 'bg-emerald-500 animate-pulse' : 'bg-amber-500'}`} />
                  <span className="font-sans text-[10px] font-bold uppercase tracking-wider text-white">
                    {isOpenNow ? 'Hub Active Now' : 'Hub Closed'}
                  </span>
                </div>
              </div>

              <div className="mt-6 space-y-3 font-sans text-xs text-stone-300 font-light">
                <div className="flex justify-between items-center pb-2.5 border-b border-white/10">
                  <span className="text-stone-400">Monday — Friday</span>
                  <span className="text-white font-semibold">07:00 AM — 08:30 PM GMT</span>
                </div>
                <div className="flex justify-between items-center pb-2.5 border-b border-white/10">
                  <span className="text-stone-400">Saturday</span>
                  <span className="text-white font-semibold">08:00 AM — 06:00 PM GMT</span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-stone-400">Sunday / Bank Holidays</span>
                  <span className="text-brand-sage font-semibold">09:00 AM — 04:00 PM GMT</span>
                </div>
              </div>
            </div>

            {/* Physical Location Details card */}
            <div className="bg-[#161616] p-6 rounded-2xl border border-white/10">
              <h4 className="font-serif text-lg text-white font-medium mb-4 flex items-center space-x-2">
                <MapPin className="w-4 h-4 text-brand-sage" />
                <span>Our Physical Sanctuary</span>
              </h4>
              <p className="font-sans text-xs text-[#8E9299] font-light leading-relaxed mb-6">
                FreshFold operates inside premium residential quarters for easy pick-drops and locker collections.
              </p>

              <div className="space-y-4 font-sans text-xs text-stone-300">
                <div className="flex items-start space-x-3">
                  <MapPin className="w-4 h-4 text-brand-sage shrink-0 mt-0.5" />
                  <div>
                    <h5 className="font-sans text-[11px] font-bold text-white uppercase tracking-wider">
                      Flagship Press-Lounge
                    </h5>
                    <p className="font-sans text-stone-400 mt-1 font-light leading-relaxed">
                      Wagyingo Opal, <br />
                      Ayeduase-Kotei, Beside the Benab Filling station
                    </p>
                  </div>
                </div>

                <div className="flex items-start space-x-3">
                  <Phone className="w-4 h-4 text-brand-sage shrink-0 mt-0.5" />
                  <div>
                    <h5 className="font-sans text-[11px] font-bold text-white uppercase tracking-wider">
                      Concierge Support Line
                    </h5>
                    <p className="font-sans text-stone-400 mt-1 font-light">
                      +233 200957165
                    </p>
                  </div>
                </div>

                <div className="flex items-start space-x-3">
                  <Mail className="w-4 h-4 text-brand-sage shrink-0 mt-0.5" />
                  <div>
                    <h5 className="font-sans text-[11px] font-bold text-white uppercase tracking-wider">
                      Director of Craft
                    </h5>
                    <p className="font-sans text-stone-400 mt-1 font-light">
                      laundry.freshfold@gmail.com
                    </p>
                  </div>
                </div>
              </div>
            </div>

          </div>

          {/* RIGHT: Quick Inquiry interactive form (Columns: 7) */}
          <div className="lg:col-span-7 bg-[#161616] p-8 rounded-2xl border border-white/10 text-left" id="contact-form-card">
            <h4 className="font-serif text-xl font-light text-white mb-2">
              Send a Boutique Inquiry
            </h4>
            <p className="font-sans text-[#8E9299] text-xs font-light mb-6">
              Have unique leather collections, bridal wear, or continuous commercial sheets that require custom logistics? Note down below and we will revert back inside 2 hours.
            </p>

            <form onSubmit={handleSendInquiry} className="space-y-4">
              <div>
                <label className="block text-[11px] font-semibold uppercase text-stone-400 tracking-wider mb-1.5">
                  Your Full Name
                </label>
                <input
                  type="text"
                  required
                  value={inquiryName}
                  onChange={(e) => setInquiryName(e.target.value)}
                  placeholder="e.g. Gloria Sarpong"
                  className="w-full bg-black text-white placeholder-[#8E9299]/30 rounded-xl p-3 border border-white/10 focus:border-brand-sage focus:outline-none text-xs transition-colors"
                />
              </div>

              <div>
                <label className="block text-[11px] font-semibold uppercase text-stone-400 tracking-wider mb-1.5">
                  Email Address
                </label>
                <input
                  type="email"
                  value={inquiryEmail}
                  onChange={(e) => setInquiryEmail(e.target.value)}
                  placeholder="e.g. GloriaSarps@gmail.com"
                  className="w-full bg-black text-white placeholder-[#8E9299]/30 rounded-xl p-3 border border-white/10 focus:border-brand-sage focus:outline-none text-xs transition-colors"
                />
              </div>

              <div>
                <label className="block text-[11px] font-semibold uppercase text-stone-400 tracking-wider mb-1.5">
                  Your Message / Requirement
                </label>
                <textarea
                  required
                  rows={4}
                  value={inquiryMsg}
                  onChange={(e) => setInquiryMsg(e.target.value)}
                  placeholder="Tell us about your thread materials, weight volumes, periodic commercial scheduling, etc."
                  className="w-full bg-black text-white placeholder-[#8E9299]/30 rounded-xl p-3 border border-white/10 focus:border-brand-sage focus:outline-none text-xs transition-colors"
                />
              </div>

              <div className="pt-2 flex flex-col sm:flex-row gap-4 items-center justify-between">
                {formSent ? (
                  <div className="flex items-center space-x-2 text-brand-sage text-xs">
                    <CheckCircle className="w-4 h-4" />
                    <span>Your mail app is open with the enquiry ready to send.</span>
                  </div>
                ) : (
                  <button
                    type="submit"
                    className="w-full sm:w-auto px-6 py-3.5 bg-white text-black font-bold font-sans text-xs uppercase tracking-widest rounded-xl hover:bg-brand-sage hover:text-white transition-all cursor-pointer border border-white/10 flex items-center justify-center space-x-2"
                  >
                    <Send className="w-3.5 h-3.5" />
                    <span>Send Inquiry</span>
                  </button>
                )}

                {/* WhatsApp shortcut hidden for now. */}
              </div>

            </form>
          </div>

        </div>

      </div>
    </section>
  );
}
