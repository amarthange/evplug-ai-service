import React, { useState, useEffect } from "react";
import { useAuth } from "@/lib/auth-context";
import { db } from "@/lib/firebase";
import { 
  collection, 
  onSnapshot, 
  query, 
  where, 
  orderBy, 
  addDoc, 
  serverTimestamp,
  doc,
  getDocs
} from "firebase/firestore";
import { 
  MessageSquare, 
  Send, 
  User, 
  AtSign, 
  ShieldCheck,
  Clock,
  Reply,
  MoreHorizontal
} from "lucide-react";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Badge } from "@/components/ui/badge";
import { formatDistanceToNow } from "date-fns";
import { cn } from "@/lib/utils";
import { useToast } from "@/hooks/use-toast";

interface AdminNotesProps {
  entityType: "station" | "user" | "booking" | "ticket";
  entityId: string;
}

export default function AdminNotes({ entityType, entityId }: AdminNotesProps) {
  const { user } = useAuth();
  const { toast } = useToast();
  const [notes, setNotes] = useState<any[]>([]);
  const [newNote, setNewNote] = useState("");
  const [loading, setLoading] = useState(false);
  const [showMentions, setShowMentions] = useState(false);
  const [onlineAdmins, setOnlineAdmins] = useState<any[]>([]);

  useEffect(() => {
    if (!db || !entityId) return;
    
    let unsub: (() => void) | null = null;
    const timeoutId = setTimeout(() => {
      try {
        const q = query(
          collection(db, "admin_notes"),
          where("entityType", "==", entityType),
          where("entityId", "==", entityId),
          orderBy("createdAt", "desc")
        );
        unsub = onSnapshot(q, (snap) => {
          setNotes(snap.docs.map(d => ({ id: d.id, ...d.data() })));
        }, (err) => {
          console.warn("⚠️ Snapshot error inside admin notes:", err);
        });
      } catch (err) {
        console.error("⚠️ Failed to establish snapshot listener:", err);
      }
    }, 50);

    return () => {
      clearTimeout(timeoutId);
      if (unsub) {
        try {
          unsub();
        } catch (err) {
          console.warn("⚠️ Safe unsub failed for admin notes:", err);
        }
      }
    };
  }, [entityId, entityType]);

  useEffect(() => {
    const fetchAdmins = async () => {
      const snap = await getDocs(collection(db, "admin_presence"));
      setOnlineAdmins(snap.docs.map(d => ({ id: d.id, ...d.data() })));
    };
    fetchAdmins();
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newNote.trim() || !user) return;
    setLoading(true);

    try {
      // Find mentions
      const mentions = newNote.match(/@(\w+)/g)?.map(m => m.substring(1)) || [];
      
      const noteRef = await addDoc(collection(db, "admin_notes"), {
        entityType,
        entityId,
        noteText: newNote,
        author: user.displayName || user.email?.split("@")[0],
        authorId: user.uid,
        createdAt: serverTimestamp(),
        mentions
      });

      // Create notifications for mentions
      for (const adminName of mentions) {
        const targetAdmin = onlineAdmins.find(a => a.adminName === adminName);
        if (targetAdmin && targetAdmin.adminId !== user.uid) {
          await addDoc(collection(db, "admin_notifications"), {
            adminId: targetAdmin.adminId,
            type: "mention",
            noteId: noteRef.id,
            mentionedBy: user.displayName || user.email?.split("@")[0],
            read: false,
            createdAt: serverTimestamp()
          });
        }
      }

      setNewNote("");
      toast({ title: "Note added" });
    } catch (error: any) {
      toast({ title: "Failed to add note", description: error.message, variant: "destructive" });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex flex-col h-full bg-slate-900 border border-slate-800 rounded-2xl overflow-hidden shadow-2xl">
      <div className="p-4 border-b border-slate-800 bg-slate-900/50 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="p-2 bg-primary/10 rounded-lg">
            <MessageSquare className="w-5 h-5 text-primary" />
          </div>
          <div>
            <h3 className="font-black text-sm uppercase tracking-wider">Internal Admin Notes</h3>
            <p className="text-[10px] text-slate-500 font-medium">Restricted to staff members only</p>
          </div>
        </div>
        <Badge variant="outline" className="text-[10px] bg-amber-500/10 text-amber-500 border-amber-500/20">
          <ShieldCheck className="w-3 h-3 mr-1" /> STAFF ONLY
        </Badge>
      </div>

      <ScrollArea className="flex-1 p-4">
        <div className="space-y-6">
          {notes.length === 0 ? (
            <div className="text-center py-12 opacity-50 space-y-2">
              <MessageSquare className="w-8 h-8 mx-auto text-slate-700" />
              <p className="text-xs italic">No internal notes for this {entityType} yet.</p>
            </div>
          ) : (
            notes.map((note) => (
              <div key={note.id} className="group animate-in fade-in slide-in-from-left-4">
                <div className="flex gap-3">
                  <Avatar className="w-8 h-8 border-2 border-slate-800">
                    <AvatarFallback className="bg-slate-800 text-[10px] font-black">
                      {note.author?.substring(0, 2).toUpperCase()}
                    </AvatarFallback>
                  </Avatar>
                  <div className="flex-1 space-y-1">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <span className="text-xs font-black text-slate-200">{note.author}</span>
                        <span className="text-[10px] text-slate-500 flex items-center gap-1">
                          <Clock className="w-3 h-3" />
                          {note.createdAt ? formatDistanceToNow(note.createdAt.toDate(), { addSuffix: true }) : 'just now'}
                        </span>
                      </div>
                      <Button variant="ghost" size="icon" className="h-6 w-6 opacity-0 group-hover:opacity-100">
                        <MoreHorizontal className="w-3 h-3" />
                      </Button>
                    </div>
                    <div className="p-3 bg-slate-950/50 border border-slate-800/50 rounded-xl rounded-tl-none">
                      <p className="text-sm text-slate-300 leading-relaxed">
                        {note.noteText.split(" ").map((word: string, i: number) => (
                          <React.Fragment key={i}>
                            {word.startsWith("@") ? (
                              <span className="text-primary font-bold">{word} </span>
                            ) : (
                              word + " "
                            )}
                          </React.Fragment>
                        ))}
                      </p>
                    </div>
                    <div className="flex items-center gap-4 mt-2">
                      <button className="text-[10px] font-black uppercase text-slate-600 hover:text-primary transition-colors flex items-center gap-1">
                        <Reply className="w-3 h-3" /> Reply
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            ))
          )}
        </div>
      </ScrollArea>

      <form onSubmit={handleSubmit} className="p-4 bg-slate-950/50 border-t border-slate-800 space-y-3">
        <div className="relative">
          <Textarea 
            placeholder={`Add an internal note... Use @ to mention other admins`}
            className="min-h-[80px] bg-slate-900 border-slate-800 focus-visible:ring-primary rounded-xl text-sm resize-none"
            value={newNote}
            onChange={(e) => {
              setNewNote(e.target.value);
              setShowMentions(e.target.value.endsWith("@"));
            }}
          />
          {showMentions && (
            <div className="absolute bottom-full left-0 mb-2 w-48 bg-slate-900 border border-slate-800 rounded-xl shadow-2xl overflow-hidden z-10">
              <div className="p-2 border-b border-slate-800">
                <span className="text-[10px] font-black uppercase text-slate-500">Mention Team Member</span>
              </div>
              {onlineAdmins.map((admin) => (
                <button
                  key={admin.id}
                  type="button"
                  className="w-full p-2 text-left text-xs hover:bg-primary/10 hover:text-primary flex items-center gap-2"
                  onClick={() => {
                    setNewNote(newNote + admin.adminName + " ");
                    setShowMentions(false);
                  }}
                >
                  <div className="w-2 h-2 rounded-full bg-emerald-500" />
                  {admin.adminName}
                </button>
              ))}
            </div>
          )}
        </div>
        <div className="flex justify-between items-center">
          <div className="flex items-center gap-2">
            <Badge variant="outline" className="text-[10px] text-slate-500">
              <AtSign className="w-3 h-3 mr-1" /> Mentions Supported
            </Badge>
          </div>
          <Button 
            disabled={loading || !newNote.trim()} 
            className="gap-2 font-black px-6 rounded-full shadow-lg shadow-primary/20"
            size="sm"
          >
            {loading ? <Clock className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
            POST NOTE
          </Button>
        </div>
      </form>
    </div>
  );
}
