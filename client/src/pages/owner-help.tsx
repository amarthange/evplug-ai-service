import { useState } from "react";
import { collection, addDoc } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { useAuth } from "@/lib/auth-context";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { HelpCircle, MessagesSquare, CheckCircle, Search } from "lucide-react";

export default function OwnerHelp() {
  const { user } = useAuth();
  const { toast } = useToast();
  
  const [subject, setSubject] = useState("");
  const [message, setMessage] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [ticketSubmitted, setTicketSubmitted] = useState(false);
  const [search, setSearch] = useState("");

  const handleCreateTicket = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return;
    setIsSubmitting(true);
    try {
      await addDoc(collection(db, "supportTickets"), {
        ownerId: user.uid,
        email: user.email,
        subject,
        message,
        status: "open",
        createdAt: Date.now()
      });
      setTicketSubmitted(true);
    } catch (e: any) {
      toast({ variant: "destructive", title: "Submission Failed", description: e.message });
    } finally {
      setIsSubmitting(false);
    }
  };

  const faqs = [
    { q: "How do I update my station's availability?", a: "Go to your 'My Stations' tab, open the connector you wish to disable, and use the toggle switch to set it to disabled. Existing bookings won't be affected." },
    { q: "When do I get my payouts?", a: "Payouts are automatically scheduled on the 1st and 15th of every month. You can view your expected settlement amounts in the Ledger." },
    { q: "A driver damaged my charger, what next?", a: "Submit an emergency support ticket below, and also try to locate the corresponding booking in the Driver CRM to document the exact time of incidence." },
    { q: "How does the Promotion system work?", a: "When you create a promotion and set it to active, all drivers viewing your station will see the discount banner. The system automatically handles computing the discounted rate." }
  ];

  const filteredFaqs = faqs.filter(f => f.q.toLowerCase().includes(search.toLowerCase()) || f.a.toLowerCase().includes(search.toLowerCase()));

  return (
    <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500">
      <div className="flex flex-col gap-2">
        <h1 className="text-4xl font-black tracking-tight text-slate-900 dark:text-white flex items-center gap-3">
           <HelpCircle className="w-8 h-8 text-primary" /> Help & Support
        </h1>
        <p className="text-muted-foreground font-medium">Find answers or contact our technical team directly.</p>
      </div>

      <div className="grid lg:grid-cols-2 gap-8 items-start">
        {/* Support Ticket Form */}
        <Card className="rounded-[30px] border-2 shadow-xl shadow-primary/5 bg-gradient-to-b from-card to-muted/20 relative overflow-hidden h-full">
           <div className="absolute top-0 right-0 w-32 h-32 bg-primary/5 rounded-full blur-2xl -mt-10 -mr-10 pointer-events-none" />
           <CardHeader>
             <CardTitle className="text-2xl font-black flex items-center gap-2">
               <MessagesSquare className="w-6 h-6 text-primary" /> Contact Support
             </CardTitle>
             <CardDescription className="opacity-80">Our engineering team usually responds within 4 hours.</CardDescription>
           </CardHeader>
           <CardContent>
             {ticketSubmitted ? (
               <div className="flex flex-col items-center justify-center space-y-4 py-8 px-4 text-center">
                  <div className="w-16 h-16 bg-green-500/20 text-green-500 rounded-full flex items-center justify-center mb-2">
                    <CheckCircle className="w-8 h-8" />
                  </div>
                  <h3 className="text-xl font-black text-slate-900 dark:text-white">Ticket Created</h3>
                  <p className="text-sm font-medium text-muted-foreground">We've received your request and will follow up via email at <span className="font-bold text-foreground">{user?.email}</span>.</p>
                  <Button onClick={() => { setTicketSubmitted(false); setSubject(""); setMessage(""); }} variant="outline" className="mt-4 rounded-full font-bold">
                    Submit Another Request
                  </Button>
               </div>
             ) : (
               <form onSubmit={handleCreateTicket} className="space-y-5 relative z-10">
                 <div className="space-y-2">
                   <label className="text-[10px] font-black uppercase text-muted-foreground tracking-widest">Issue Subject</label>
                   <Input 
                      required 
                      placeholder="e.g. CCS2 Connector Offline" 
                      value={subject} 
                      onChange={e => setSubject(e.target.value)}
                      className="rounded-xl h-12 bg-background/50 border-2 focus-visible:border-primary/50"
                   />
                 </div>
                 <div className="space-y-2">
                   <label className="text-[10px] font-black uppercase text-muted-foreground tracking-widest">Description</label>
                   <Textarea 
                      required 
                      rows={6}
                      placeholder="Please describe the issue in detail. Include booking IDs if relevant..." 
                      value={message} 
                      onChange={e => setMessage(e.target.value)}
                      className="rounded-xl bg-background/50 border-2 resize-none focus-visible:border-primary/50"
                   />
                 </div>
                 <Button type="submit" disabled={isSubmitting} className="w-full h-12 rounded-xl font-black shadow-xl shadow-primary/20 uppercase tracking-widest mt-2 hover:scale-[1.02] transition-transform">
                   {isSubmitting ? "Sending..." : "Submit Support Ticket"}
                 </Button>
               </form>
             )}
           </CardContent>
        </Card>

        {/* FAQ Section */}
        <div className="space-y-4">
           <div className="relative">
              <Search className="w-4 h-4 absolute left-4 top-1/2 -translate-y-1/2 text-muted-foreground" />
              <Input 
                placeholder="Search FAQs..." 
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="pl-11 h-14 rounded-2xl bg-muted/40 font-bold border-transparent focus-visible:border-primary/30 text-lg" 
              />
           </div>
           
           <Card className="rounded-[30px] border-none shadow-sm bg-transparent">
             <CardContent className="p-0">
               <Accordion type="single" collapsible className="w-full space-y-3">
                 {filteredFaqs.length === 0 ? (
                   <div className="p-6 text-center text-muted-foreground font-bold">No answers found for "{search}"</div>
                 ) : (
                   filteredFaqs.map((faq, i) => (
                     <AccordionItem key={i} value={`item-${i}`} className="border-2 border-border/50 bg-card rounded-[20px] px-6 data-[state=open]:border-primary/50 data-[state=open]:shadow-md transition-all">
                       <AccordionTrigger className="text-left font-black text-sm md:text-base hover:no-underline py-5">
                         {faq.q}
                       </AccordionTrigger>
                       <AccordionContent className="text-muted-foreground font-medium text-sm leading-relaxed pb-5">
                         {faq.a}
                       </AccordionContent>
                     </AccordionItem>
                   ))
                 )}
               </Accordion>
             </CardContent>
           </Card>
        </div>
      </div>
    </div>
  );
}
