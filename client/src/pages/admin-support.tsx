import { useState, useEffect, useMemo } from "react";
import { useLocation } from "wouter";
import { useAuth } from "@/lib/auth-context";
import { 
  collection, 
  query, 
  orderBy, 
  onSnapshot,
  doc,
  updateDoc,
  serverTimestamp,
  addDoc,
  writeBatch
} from "firebase/firestore";
import { db } from "@/lib/firebase";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { 
  Sheet, 
  SheetContent, 
  SheetHeader, 
  SheetTitle, 
  SheetDescription 
} from "@/components/ui/sheet";
import { useToast } from "@/hooks/use-toast";
import { 
  MessagesSquare, 
  Clock, 
  User, 
  CheckCircle2, 
  AlertCircle,
  MoreHorizontal,
  Mail,
  Building2,
  Send,
  Loader2,
  Lock,
  ShieldCheck
} from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import AdminNotes from "@/components/AdminNotes";

export default function AdminSupport() {
  const [location, setLocation] = useLocation();
  const { user, userRole, loading: authLoading } = useAuth();
  const { toast } = useToast();

  const [tickets, setTickets] = useState<any[]>([]);
  const [selectedTicket, setSelectedTicket] = useState<any>(null);
  const [adminResponse, setAdminResponse] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [filterStatus, setFilterStatus] = useState("all");
  const [ticketSearch, setTicketSearch] = useState("");
  const [newNote, setNewNote] = useState("");
  const [selectedTickets, setSelectedTickets] = useState<string[]>([]);

  const RESPONSE_TEMPLATES = [
    {
      label: "Acknowledge",
      text: "Thank you for reaching out. We have received your ticket and our team is reviewing it. We will respond within 24 hours."
    },
    {
      label: "Payout Delay",
      text: "We apologize for the payout delay. Payouts are processed on the 1st of each month to your registered UPI ID. Please verify your UPI ID in Settings."
    },
    {
      label: "Station Issue",
      text: "We are sorry to hear about the issue at your station. Please use the Emergency Maintenance toggle in your Owner Portal to take it offline while repairs are made."
    },
    {
      label: "Technical Support",
      text: "For technical issues, please try clearing your browser cache and logging in again. If the problem persists, please describe the exact error message."
    },
    {
      label: "Resolved",
      text: "This issue has been resolved. Please let us know if you experience any further problems. Thank you for using our platform."
    }
  ];

  const autoAssignPriority = (ticket: any): "high" | "medium" | "low" => {
    const text = (ticket.subject + " " + (ticket.message || "")).toLowerCase();
    const highKeywords = ["urgent","emergency","broken","not working","fraud","payment failed","station down","cannot charge","error","critical","hack"];
    const mediumKeywords = ["delayed","payout","billing","complaint","wrong","issue","problem","dispute","refund"];
    
    if (highKeywords.some(k => text.includes(k))) return "high";
    if (mediumKeywords.some(k => text.includes(k))) return "medium";
    return "low";
  };

  const getTicketAge = (createdAt: any, priority: string) => {
    const created = createdAt?.toDate ? createdAt.toDate() : new Date(createdAt);
    const hours = (Date.now() - created.getTime()) / 3600000;
    
    const slaLimit = { high: 4, medium: 24, low: 72 };
    const limit = slaLimit[priority as keyof typeof slaLimit] || 24;
    
    return {
      hoursOpen: Math.floor(hours),
      breached: hours > limit,
      label: hours < 1 ? "Just now" : hours < 24 ? `${Math.floor(hours)}h ago` : `${Math.floor(hours/24)}d ago`,
      slaStatus: hours > limit ? "BREACHED" : hours > limit * 0.8 ? "WARNING" : "ON_TRACK"
    };
  };

  // Safe authorization redirect effect
  useEffect(() => {
    if (!authLoading && userRole !== "admin") {
      setLocation("/");
    }
  }, [authLoading, userRole, setLocation]);

  useEffect(() => {
    let unsubscribe: (() => void) | null = null;
    const timeoutId = setTimeout(() => {
      try {
        const q = query(
          collection(db, "supportTickets"),
          orderBy("createdAt", "desc")
        );

        unsubscribe = onSnapshot(q, (snap) => {
          setTickets(snap.docs.map(d => ({ id: d.id, ...d.data() })));
        }, (err) => {
          console.warn("⚠️ Snapshot error on support tickets query:", err);
        });
      } catch (err) {
        console.error("⚠️ Failed to establish support tickets query:", err);
      }
    }, 50);

    return () => {
      clearTimeout(timeoutId);
      if (unsubscribe) {
        try {
          unsubscribe();
        } catch (err) {
          console.warn("⚠️ Safe unsub failed for support tickets:", err);
        }
      }
    };
  }, []);

  const ticketsWithPriority = useMemo(() => {
    return tickets.map(t => ({
      ...t,
      priority: t.priority || autoAssignPriority(t)
    }));
  }, [tickets]);

  const filteredTickets = useMemo(() => {
    let result = ticketsWithPriority;
    
    if (filterStatus !== "all") {
      result = result.filter(t => t.status === filterStatus);
    }
    
    if (ticketSearch.trim()) {
      const s = ticketSearch.toLowerCase();
      result = result.filter(t => 
        t.subject?.toLowerCase().includes(s) || 
        t.message?.toLowerCase().includes(s) || 
        t.businessName?.toLowerCase().includes(s) || 
        t.ownerEmail?.toLowerCase().includes(s) ||
        t.email?.toLowerCase().includes(s)
      );
    }
    
    return result;
  }, [ticketsWithPriority, filterStatus, ticketSearch]);

  const breachedTicketsCount = ticketsWithPriority.filter(t => {
    const { breached } = getTicketAge(t.createdAt, t.priority);
    return breached && t.status !== "resolved";
  }).length;

  const handleResolveTicket = async (ticketId: string) => {
    if (!adminResponse.trim()) {
      toast({ variant: "destructive", title: "Response required", description: "Please type a response before resolving." });
      return;
    }

    setIsSubmitting(true);
    try {
      const ticketRef = doc(db, "supportTickets", ticketId);
      const ticket = tickets.find(t => t.id === ticketId);

      await updateDoc(ticketRef, {
        adminResponse: adminResponse,
        status: "resolved",
        resolvedAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
        assignedTo: user?.uid
      });

      // Create notification for owner
      await addDoc(collection(db, "notifications"), {
        userId: ticket.ownerId,
        type: "SUPPORT_RESPONSE",
        title: "Support ticket resolved",
        message: `Your ticket "${ticket.subject}" has been resolved by admin. Response: ${adminResponse.substring(0, 50)}...`,
        read: false,
        createdAt: serverTimestamp()
      });

      // Log action
      await addDoc(collection(db, "audit_logs"), {
        action: "SUPPORT_TICKET_RESOLVED",
        severity: "LOW",
        performedBy: user?.uid,
        performedByEmail: user?.email,
        targetId: ticketId,
        targetType: "supportTicket",
        timestamp: serverTimestamp()
      });

      toast({ title: "Ticket resolved", description: "The owner has been notified." });
      setSelectedTicket(null);
      setAdminResponse("");
    } catch (e: any) {
      toast({ variant: "destructive", title: "Error", description: e.message });
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleAddNote = async (ticketId: string) => {
    if (!newNote.trim()) return;
    
    try {
      const ticketRef = doc(db, "supportTickets", ticketId);
      const noteObj = {
        text: newNote,
        addedBy: user?.email,
        addedAt: new Date().toISOString(),
        internalOnly: true
      };
      
      await updateDoc(ticketRef, {
        internalNotes: [...(selectedTicket.internalNotes || []), noteObj]
      });
      
      setSelectedTicket({
        ...selectedTicket,
        internalNotes: [...(selectedTicket.internalNotes || []), noteObj]
      });
      setNewNote("");
      toast({ title: "Internal note added" });
    } catch (e: any) {
      toast({ variant: "destructive", title: "Error saving note", description: e.message });
    }
  };

  const toggleTicket = (id: string) => {
    setSelectedTickets(prev =>
      prev.includes(id)
        ? prev.filter(t => t !== id)
        : [...prev, id])
  };

  const selectAll = () => {
    setSelectedTickets(filteredTickets.map(t => t.id));
  };

  const clearSelection = () => {
    setSelectedTickets([]);
  };

  const handleBulkResolve = async () => {
    const batch = writeBatch(db);
    
    selectedTickets.forEach(ticketId => {
      batch.update(doc(db, "supportTickets", ticketId), {
        status: "resolved",
        resolvedAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
        assignedTo: user?.uid
      });
    });
    
    await batch.commit();
    
    await addDoc(collection(db, "audit_logs"), {
      action: "BULK_TICKETS_RESOLVED",
      severity: "LOW",
      performedBy: user?.uid,
      performedByEmail: user?.email,
      targetId: selectedTickets.join(","),
      targetType: "supportTicket",
      metadata: { count: selectedTickets.length },
      timestamp: serverTimestamp()
    });
    
    clearSelection();
    toast({ title: `${selectedTickets.length} tickets resolved` });
  };

  const handleBulkInProgress = async () => {
    const batch = writeBatch(db);
    selectedTickets.forEach(id => {
      batch.update(doc(db, "supportTickets", id), {
        status: "in_progress",
        updatedAt: serverTimestamp(),
        assignedTo: user?.uid
      });
    });
    await batch.commit();
    clearSelection();
    toast({ title: "Tickets marked in progress" });
  };

  const handleBulkClose = async () => {
    if (!window.confirm(`Close ${selectedTickets.length} tickets?\nThis will mark them as resolved.`)) return;
    
    const batch = writeBatch(db);
    selectedTickets.forEach(id => {
      batch.update(doc(db, "supportTickets", id), {
        status: "resolved",
        closedBy: "bulk_admin_action",
        resolvedAt: serverTimestamp(),
        updatedAt: serverTimestamp()
      });
    });
    await batch.commit();
    clearSelection();
    toast({ title: "Tickets closed" });
  };

  useEffect(() => {
    const autoClose = async () => {
      const sevenDaysAgo = new Date(Date.now() - 7 * 86400000);
      
      const staleTickets = tickets.filter(t => {
        if (t.status === "resolved") return false;
        const updated = t.updatedAt?.toDate ? t.updatedAt.toDate() : (t.updatedAt ? new Date(t.updatedAt) : (t.createdAt?.toDate ? t.createdAt.toDate() : new Date(t.createdAt)));
        return updated && updated < sevenDaysAgo;
      });
      
      if (staleTickets.length === 0) return;
      
      const batch = writeBatch(db);
      staleTickets.forEach(t => {
        batch.update(doc(db, "supportTickets", t.id), {
          status: "resolved",
          closedBy: "auto_close_7_days",
          resolvedAt: serverTimestamp(),
          updatedAt: serverTimestamp()
        });
      });
      
      await batch.commit();
      toast({ title: `${staleTickets.length} stale ticket(s) auto-closed (7 day limit)` });
    };
    
    if (tickets.length > 0) autoClose();
  }, [tickets.length]);

  const updateStatus = async (ticketId: string, status: string) => {
    try {
      await updateDoc(doc(db, "supportTickets", ticketId), { 
        status, 
        updatedAt: serverTimestamp(),
        assignedTo: user?.uid
      });
      toast({ title: `Status updated to ${status}` });
    } catch (e: any) {
      toast({ variant: "destructive", title: "Error", description: e.message });
    }
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case "open": return <Badge className="bg-red-500 font-bold uppercase tracking-widest text-[10px]">Open</Badge>;
      case "in_progress": return <Badge className="bg-yellow-500 text-black font-bold uppercase tracking-widest text-[10px]">In Progress</Badge>;
      case "resolved": return <Badge className="bg-green-500 font-bold uppercase tracking-widest text-[10px]">Resolved</Badge>;
      default: return <Badge variant="outline">{status}</Badge>;
    }
  };

  if (authLoading) {
    return (
      <div className="h-screen w-screen flex items-center justify-center bg-[var(--admin-bg)] text-[var(--admin-text-primary)]">
        <Loader2 className="w-10 h-10 animate-spin text-primary" />
        <span className="ml-3 font-bold">Authenticating Staff...</span>
      </div>
    );
  }

  if (userRole !== "admin") {
    return null;
  }

  return (
    <div className="container mx-auto p-6 space-y-8 min-h-screen pb-20 bg-[var(--admin-bg)] text-[var(--admin-text-primary)] transition-colors duration-300">
      <div>
        <h1 className="text-4xl font-black tracking-tight flex items-center gap-3 admin-heading-highlight">
          <MessagesSquare className="w-10 h-10 text-primary" />
          Support Tickets
        </h1>
        <p className="admin-text-muted font-medium mt-1">Manage and resolve owner help requests</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
        <style>{`
          .sla-indicator { font-size: 10px; padding: 2px 10px; border-radius: 12px; font-weight: 800; text-transform: uppercase; letter-spacing: 0.05em; }
          .sla-on_track { background: #dcfce7; color: #166534; }
          .sla-warning { background: #fef3c7; color: #92400e; }
          .sla-breached { background: #fee2e2; color: #991b1b; }
          
          .template-chips { display: flex; gap: 6px; flex-wrap: wrap; margin-bottom: 12px; align-items: center; }
          .template-label { font-size: 11px; font-weight: 800; color: var(--admin-text-muted); text-transform: uppercase; letter-spacing: 0.05em; margin-right: 4px; }
          .template-chip { font-size: 11px; padding: 4px 12px; border-radius: 20px; border: 2px solid var(--admin-border); cursor: pointer; background: transparent; transition: all 0.2s ease; font-weight: 600; color: var(--admin-text-primary); }
          .template-chip:hover { border-color: hsl(var(--primary)); color: hsl(var(--primary)); background: hsl(var(--primary) / 0.05); transform: translateY(-1px); }
          
          .ticket-search-input { width: 100%; max-width: 400px; padding: 12px 20px; border-radius: 16px; border: 2px solid var(--admin-border); background: var(--admin-border-muted); color: var(--admin-text-primary); font-weight: 500; outline: none; transition: all 0.2s ease; }
          .ticket-search-input:focus { border-color: hsl(var(--primary) / 0.5); background: var(--admin-bg); box-shadow: 0 4px 12px rgba(0,0,0,0.05); }

          .internal-notes-section { margin-top: 32px; padding-top: 32px; border-top: 2px dashed var(--admin-border); position: relative; }
          .internal-badge { position: absolute; top: -14px; left: 50%; transform: translateX(-50%); background: var(--admin-border-muted); padding: 4px 12px; border-radius: 20px; font-size: 10px; font-weight: 900; letter-spacing: 0.1em; color: var(--admin-text-muted); border: 2px solid var(--admin-border); }
          .note-card { background: var(--admin-border-muted); padding: 16px; border-radius: 20px; border: 1px solid var(--admin-border); margin-bottom: 8px; }

          .bulk-ticket-bar {
            display:flex; align-items:center; gap:20px;
            padding:16px 24px; margin-bottom:24px;
            background: linear-gradient(135deg, #22c55e, #16a34a);
            color:white; border-radius:24px; shadow: 0 10px 25px -5px rgba(34, 197, 94, 0.4);
            animation: slideInDown 0.3s ease-out;
            position: sticky; top: 10px; z-index: 50;
          }
          @keyframes slideInDown { from { transform: translateY(-20px); opacity: 0; } to { transform: translateY(0); opacity: 1; } }
          
          .bulk-count { font-size:14px; font-weight:800; text-transform: uppercase; letter-spacing: 0.1em; }
          .bulk-actions { display: flex; gap: 8px; flex-wrap: wrap; align-items: center; }
          
          .bulk-btn {
            padding:8px 16px; border-radius:12px;
            border:2px solid rgba(255,255,255,0.3);
            background:rgba(255,255,255,0.1);
            color:white; font-size:11px; cursor:pointer;
            font-weight: 800; text-transform: uppercase;
            transition: all 0.2s ease;
          }
          .bulk-btn:hover { background: white; color: #16a34a; border-color: white; transform: translateY(-1px); }
          
          .bulk-btn-secondary {
            padding:5px 12px; border-radius:6px;
            border:none; background:transparent;
            color:rgba(255,255,255,0.8);
            font-size:11px; cursor:pointer;
            font-weight: 700; text-decoration:underline;
          }
          
          .ticket-checkbox-container { padding-right: 20px; border-right: 2px solid var(--admin-border); margin-right: 20px; display: flex; align-items: center; }
          .ticket-checkbox {
            width:24px; height:24px; cursor:pointer;
            accent-color:#22c55e; border-radius: 8px;
          }
        `}</style>

        <Card className="bg-red-500/5 border-red-500/20">
          <CardContent className="p-6 flex items-center justify-between">
            <div>
              <p className="text-sm font-bold text-red-600 dark:text-red-400 uppercase tracking-widest mb-1">Open</p>
              <h3 className="text-4xl font-black">{tickets.filter(t => t.status === "open").length}</h3>
            </div>
            <AlertCircle className="w-10 h-10 text-red-500 opacity-20" />
          </CardContent>
        </Card>

        <Card className={`border-2 ${breachedTicketsCount > 0 ? 'bg-red-600 text-white border-red-400 animate-pulse' : 'bg-[var(--admin-border-muted)] border-[var(--admin-border)]'}`}>
          <CardContent className="p-6 flex items-center justify-between">
             <div>
               <p className={`text-sm font-bold uppercase tracking-widest mb-1 ${breachedTicketsCount > 0 ? 'text-white' : 'admin-text-muted'}`}>SLA Breached</p>
               <h3 className="text-4xl font-black">{breachedTicketsCount}</h3>
             </div>
             <AlertCircle className={`w-10 h-10 ${breachedTicketsCount > 0 ? 'text-white' : 'text-red-500'} opacity-30`} />
          </CardContent>
        </Card>

        <Card className="bg-yellow-500/5 border-yellow-500/20">
          <CardContent className="p-6 flex items-center justify-between">
            <div>
              <p className="text-sm font-bold text-yellow-600 dark:text-yellow-400 uppercase tracking-widest mb-1">In Progress</p>
              <h3 className="text-4xl font-black">{tickets.filter(t => t.status === "in_progress").length}</h3>
            </div>
            <Clock className="w-10 h-10 text-yellow-500 opacity-20" />
          </CardContent>
        </Card>

        <Card className="bg-green-500/5 border-green-500/20">
          <CardContent className="p-6 flex items-center justify-between">
            <div>
              <p className="text-sm font-bold text-green-600 dark:text-green-400 uppercase tracking-widest mb-1">Resolved</p>
              <h3 className="text-4xl font-black">{tickets.filter(t => t.status === "resolved").length}</h3>
            </div>
            <CheckCircle2 className="w-10 h-10 text-green-500 opacity-20" />
          </CardContent>
        </Card>
      </div>

      <div className="flex flex-col md:flex-row justify-between items-center gap-6 pt-4">
        <div className="flex gap-2 p-1 bg-[var(--admin-border-muted)] rounded-2xl w-fit border-2 border-[var(--admin-border)]">
          {["all", "open", "in_progress", "resolved"].map(s => (
            <Button 
              key={s}
              variant={filterStatus === s ? "default" : "ghost"} 
              className={`rounded-xl px-6 font-bold uppercase tracking-widest text-[10px] ${filterStatus === s ? '' : 'admin-text-muted'}`}
              onClick={() => setFilterStatus(s)}
            >
              {s.replace("_", " ")}
            </Button>
          ))}
        </div>

        <div className="flex items-center gap-4 w-full md:w-auto">
          <p className="text-[10px] font-black uppercase admin-text-muted whitespace-nowrap">
            Showing {filteredTickets.length} of {tickets.length} tickets
          </p>
          <input
            className="ticket-search-input"
            placeholder="Search tickets, businesses, emails..."
            value={ticketSearch}
            onChange={e => setTicketSearch(e.target.value)}
          />
        </div>
      </div>

      {selectedTickets.length > 0 && (
        <div className="bulk-ticket-bar">
          <div className="flex items-center gap-4">
             <div className="p-2 bg-white/20 rounded-xl">
                <CheckCircle2 className="w-5 h-5 text-white" />
             </div>
             <span className="bulk-count">
               {selectedTickets.length} Selected
             </span>
          </div>
          
          <div className="bulk-actions flex-1 flex justify-center">
            <button className="bulk-btn" onClick={handleBulkResolve}>Mark Resolved</button>
            <button className="bulk-btn" onClick={handleBulkInProgress}>Mark In Progress</button>
            <button className="bulk-btn" onClick={handleBulkClose}>Close Stale</button>
          </div>

          <div className="flex items-center gap-4">
            <button className="bulk-btn-secondary" onClick={selectAll}>Select All ({filteredTickets.length})</button>
            <button className="bulk-btn-secondary" onClick={clearSelection}>Clear Selection</button>
          </div>
        </div>
      )}

      <div className="grid gap-4">
        {filteredTickets.map(ticket => (
          <Card key={ticket.id} className={`group hover:border-primary/50 transition-all cursor-pointer shadow-sm hover:shadow-xl admin-glass-card border-none ${selectedTickets.includes(ticket.id) ? 'border-primary ring-4 ring-primary/5 bg-primary/5' : ''}`} onClick={() => setSelectedTicket(ticket)}>
            <CardContent className="p-6">
              <div className="flex items-center gap-0">
                <div className="ticket-checkbox-container" onClick={(e) => e.stopPropagation()}>
                    <input
                      type="checkbox"
                      checked={selectedTickets.includes(ticket.id)}
                      onChange={() => toggleTicket(ticket.id)}
                      className="ticket-checkbox"
                    />
                </div>
                
                <div className="flex-1 flex justify-between items-start gap-4 ml-6">
                  <div className="flex-1 space-y-3">
                  <div className="flex items-center gap-3">
                    {getStatusBadge(ticket.status)}
                    <Badge variant="outline" className={`font-black uppercase tracking-widest text-[9px] ${
                      ticket.priority === 'high' ? 'border-red-500/30 text-red-500 bg-red-500/10' : 
                      ticket.priority === 'medium' ? 'border-yellow-500/30 text-yellow-600 dark:text-yellow-400 bg-yellow-500/10' : 
                      'border-blue-500/30 text-blue-500 bg-blue-500/10'
                    }`}>
                      {ticket.priority} priority
                    </Badge>
                    <span className="text-[10px] font-black uppercase tracking-widest admin-text-muted flex items-center gap-1">
                      <Clock className="w-3 h-3" />
                      {(() => {
                        const { label, slaStatus, breached } = getTicketAge(ticket.createdAt, ticket.priority);
                        return (
                          <span className={`sla-indicator sla-${slaStatus.toLowerCase()}`}>
                            {label}
                            {breached && " ⚠️ SLA Breached"}
                          </span>
                        );
                      })()}
                    </span>
                  </div>
                  </div>
                  
                  <div>
                    <h3 className="text-xl font-black tracking-tight group-hover:text-primary transition-colors">{ticket.subject}</h3>
                    <p className="text-sm admin-text-muted font-medium line-clamp-2 mt-1 italic">
                      "{ticket.message}"
                    </p>
                  </div>

                  <div className="flex flex-wrap gap-4 pt-2">
                    <div className="flex items-center gap-2">
                      <div className="p-2 bg-[var(--admin-border-muted)] rounded-lg">
                        <Building2 className="w-3 h-3 admin-text-muted" />
                      </div>
                      <span className="text-xs font-bold">{ticket.businessName || "Private Station Owner"}</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <div className="p-2 bg-[var(--admin-border-muted)] rounded-lg">
                        <Mail className="w-3 h-3 admin-text-muted" />
                      </div>
                      <span className="text-xs font-medium admin-text-muted">{ticket.ownerEmail || ticket.email}</span>
                    </div>
                  </div>
                </div>

                <div className="flex flex-col gap-2">
                   <Button variant="outline" className="font-bold gap-2 group-hover:bg-primary group-hover:text-primary-foreground transition-all bg-[var(--admin-border-muted)] border-[var(--admin-border)] text-[var(--admin-text-primary)]">
                     View & Reply
                     <MoreHorizontal className="w-4 h-4" />
                   </Button>
                </div>
              </div>
          </CardContent>
          </Card>
        ))}
        {filteredTickets.length === 0 && (
          <div className="py-20 text-center space-y-4 bg-[var(--admin-border-muted)] border-2 border-dashed border-[var(--admin-border)] rounded-3xl">
            <MessagesSquare className="w-16 h-16 admin-text-muted mx-auto opacity-20" />
            <p className="text-lg font-bold admin-text-muted">No tickets found in this category.</p>
          </div>
        )}
      </div>

      {/* Ticket Detail Drawer */}
      <Sheet open={!!selectedTicket} onOpenChange={() => setSelectedTicket(null)}>
        <SheetContent className="sm:max-w-xl overflow-y-auto">
          {selectedTicket && (
            <div className="space-y-8 py-6">
              <SheetHeader>
                <div className="flex justify-between items-center mb-4">
                  {getStatusBadge(selectedTicket.status)}
                </div>
                <SheetTitle className="text-3xl font-black tracking-tighter leading-tight italic uppercase">
                  {selectedTicket.subject}
                </SheetTitle>
                <SheetDescription className="text-base font-medium">
                  Submitted by {selectedTicket.ownerEmail || selectedTicket.email}
                </SheetDescription>
              </SheetHeader>

              <Card className="bg-[var(--admin-border-muted)] border-none shadow-none rounded-[30px]">
                <CardContent className="p-8 space-y-4 italic text-[var(--admin-text-secondary)]">
                  <MessagesSquare className="w-8 h-8 text-primary/20 absolute -top-2 -left-2 rotate-12" />
                  <p className="relative z-10 font-bold leading-relaxed">{selectedTicket.message}</p>
                </CardContent>
              </Card>

              {selectedTicket.status !== "resolved" ? (
                <div className="space-y-6">
                  <div className="space-y-3">
                    <label className="text-[10px] font-black uppercase admin-text-muted tracking-widest flex items-center gap-2">
                      <Send className="w-3 h-3" />
                      Admin Response
                    </label>
                    <div className="template-chips">
                      <span className="template-label">Quick Templates:</span>
                      {RESPONSE_TEMPLATES.map(t => (
                        <button key={t.label}
                          className="template-chip"
                          onClick={() => setAdminResponse(t.text)}>
                          {t.label}
                        </button>
                      ))}
                    </div>

                    <Textarea 
                      rows={8}
                      placeholder="Type your official response here. This will be visible to the owner and will resolution the ticket." 
                      className="rounded-3xl border-2 p-6 font-medium focus-visible:border-primary/50 bg-[var(--admin-bg)]/50 border-[var(--admin-border)] text-[var(--admin-text-primary)]"
                      value={adminResponse}
                      onChange={e => setAdminResponse(e.target.value)}
                    />
                  </div>

                  <div className="grid grid-cols-2 gap-4">
                    <Button 
                      variant="outline" 
                      className="h-14 rounded-2xl font-black uppercase tracking-widest bg-[var(--admin-border-muted)] border-[var(--admin-border)] text-[var(--admin-text-primary)]"
                      onClick={() => updateStatus(selectedTicket.id, "in_progress")}
                      disabled={selectedTicket.status === "in_progress" || isSubmitting}
                    >
                      Mark In Progress
                    </Button>
                    <Button 
                      className="h-14 rounded-2xl font-black uppercase tracking-widest shadow-xl shadow-primary/20"
                      onClick={() => handleResolveTicket(selectedTicket.id)}
                      disabled={isSubmitting}
                    >
                      <CheckCircle2 className="w-5 h-5 mr-2" />
                      Resolve & Send
                    </Button>
                  </div>

                      <AdminNotes entityType="ticket" entityId={selectedTicket.id} />
                </div>
              ) : (
                <Card className="border-green-500/30 bg-green-500/5 rounded-[30px]">
                   <CardHeader>
                     <CardTitle className="text-lg font-black flex items-center gap-2 text-green-600 dark:text-green-400">
                       <CheckCircle2 className="w-5 h-5" />
                       Resolution Provided
                     </CardTitle>
                   </CardHeader>
                   <CardContent className="p-8 pt-0 font-medium">
                     <p className="text-[var(--admin-text-primary)] mb-4 line-through decoration-primary/20 decoration-2">{selectedTicket.message}</p>
                     <div className="bg-[var(--admin-border-muted)] p-6 rounded-2xl border-2 border-green-500/10">
                        <p className="text-sm font-bold opacity-80">{selectedTicket.adminResponse}</p>
                      </div>
                     <p className="text-[10px] font-black uppercase tracking-widest admin-text-muted mt-4">
                       Resolved {selectedTicket.resolvedAt ? formatDistanceToNow(selectedTicket.resolvedAt.toDate ? selectedTicket.resolvedAt.toDate() : new Date(selectedTicket.resolvedAt)) + " ago" : ""}
                     </p>
                   </CardContent>
                </Card>
              )}
            </div>
          )}
        </SheetContent>
      </Sheet>
    </div>
  );
}

