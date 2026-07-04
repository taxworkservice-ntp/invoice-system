import { useState, useEffect, useRef, useCallback } from "react";
import { MessageSquare } from "lucide-react";
import { Button } from "../ui/Button";
import { supabase } from "../../lib/supabase";
import type { DealNote } from "../../types";

const ROLE_BADGE: Record<string, { label: string; color: string }> = {
  owner: { label: "Owner", color: "bg-amber-100 text-amber-800" },
  manager: { label: "Manager", color: "bg-blue-100 text-blue-800" },
  officer: { label: "Officer", color: "bg-slate-100 text-slate-600" },
};

function relativeTime(dateStr: string): string {
  const diff = Math.floor((Date.now() - new Date(dateStr).getTime()) / 1000);
  if (diff < 60) return "just now";
  if (diff < 3600) return Math.floor(diff / 60) + "m ago";
  if (diff < 86400) return Math.floor(diff / 3600) + "h ago";
  if (diff < 172800) return "yesterday";
  return Math.floor(diff / 86400) + "d ago";
}

const COLLAPSE_COUNT = 3;

export function DealNotes({ dealId, userId }: { dealId: string; userId: string }) {
  const [notes, setNotes] = useState<DealNote[]>([]);
  const [content, setContent] = useState("");
  const [sending, setSending] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);

  const fetchNotes = useCallback(async () => {
    const { data: raw } = await supabase
      .from("deal_notes")
      .select("id, deal_id, user_id, content, created_at")
      .eq("deal_id", dealId)
      .order("created_at", { ascending: false });
    if (!raw) return;

    const authorIds = [...new Set(raw.map((n) => n.user_id))];
    const roleMap = new Map<string, string>();
    if (authorIds.length > 0) {
      const { data: members } = await supabase
        .from("client_members")
        .select("member_user_id, role")
        .eq("member_user_id", userId)
        .in("member_user_id", authorIds);
      for (const m of members || []) roleMap.set(m.member_user_id, m.role);
    }

    setNotes(raw.map((n) => ({
      id: n.id,
      deal_id: n.deal_id,
      user_id: n.user_id,
      author_name: n.user_id === userId ? "คุณ" : "สมาชิก",
      author_role: (n.user_id === userId ? "owner" : roleMap.get(n.user_id) || "officer") as DealNote["author_role"],
      content: n.content,
      created_at: n.created_at,
    })));
  }, [dealId, userId]);

  useEffect(() => { fetchNotes(); }, [fetchNotes]);

  function autoResize() {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = Math.min(el.scrollHeight, 120) + "px";
  }

  async function handleSend() {
    const trimmed = content.trim();
    if (!trimmed || sending) return;
    setSending(true);
    try {
      const { error } = await supabase.from("deal_notes").insert({
        deal_id: dealId, user_id: userId, content: trimmed,
      });
      if (error) throw error;
      setContent("");
      if (textareaRef.current) textareaRef.current.style.height = "auto";
      await fetchNotes();
    } catch (err: any) {
      console.warn("Note insert failed:", err);
    } finally {
      setSending(false);
    }
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  }

  const visibleNotes = expanded ? notes : notes.slice(0, COLLAPSE_COUNT);
  const hiddenCount = notes.length - COLLAPSE_COUNT;

  return (
    <section className="rounded-[22px] border border-[#E8E6DF] bg-white p-4 sm:p-5">
      <div className="flex items-center gap-2 mb-4">
        <MessageSquare className="w-4 h-4 text-[#8A8478]" />
        <h3 className="text-sm font-semibold text-[#1A1A18]">บันทึกภายใน</h3>
      </div>

      {notes.length === 0 && (
        <p className="text-xs text-[#888780] mb-3">ยังไม่มีบันทึก</p>
      )}

      {visibleNotes.map((note) => {
        const badge = ROLE_BADGE[note.author_role] || ROLE_BADGE.officer;
        return (
          <div key={note.id} className="mb-3 last:mb-0">
            <div className="flex items-center gap-2 mb-0.5">
              <span className={`inline-flex rounded px-1.5 py-0.5 text-[10px] font-medium ${badge.color}`}>
                {badge.label}
              </span>
              <span className="text-[10px] text-[#b0aca0]">{relativeTime(note.created_at)}</span>
            </div>
            <p className="text-xs text-[#444441] whitespace-pre-wrap leading-relaxed">
              {note.content}
            </p>
          </div>
        );
      })}

      {!expanded && hiddenCount > 0 && (
        <button
          onClick={() => setExpanded(true)}
          className="text-[11px] text-[#378ADD] font-medium hover:underline mt-1 mb-3"
        >
          ดูทั้งหมด ({notes.length})
        </button>
      )}

      <div className="mt-3 flex gap-2 items-start">
        <textarea
          ref={textareaRef}
          value={content}
          onChange={(e) => { setContent(e.target.value); autoResize(); }}
          onKeyDown={handleKeyDown}
          rows={1}
          placeholder="เขียนบันทึก..."
          maxLength={2000}
          className="flex-1 resize-none rounded-lg border border-[#E8E6DF] bg-[#FAFAF7] px-3 py-2 text-xs text-[#1A1A18] placeholder:text-[#b0aca0] focus:outline-none focus:border-[#378ADD] focus:ring-1 focus:ring-[#378ADD]/20"
        />
        <Button size="sm" onClick={handleSend} loading={sending} disabled={!content.trim()}>
          ส่ง
        </Button>
      </div>
    </section>
  );
}
