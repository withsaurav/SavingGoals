import { useState, useRef, useEffect } from "react";
import { api, formatApiError } from "@/lib/api";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Leaf, Send } from "lucide-react";
import { toast } from "sonner";

const STARTERS = [
  "How am I doing this month?",
  "Where am I overspending?",
  "How can I save more toward goals?",
  "Is my 50/30/20 split realistic?",
];

export default function Advisor() {
  const [messages, setMessages] = useState([
    { role: "sage", text: "Hi, I'm Sage. Ask me anything about your budget — I'm looking at your live numbers." },
  ]);
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const scrollRef = useRef(null);

  useEffect(() => { scrollRef.current?.scrollTo({ top: 99999, behavior: "smooth" }); }, [messages]);

  const send = async (text) => {
    const msg = (text ?? input).trim();
    if (!msg || sending) return;
    setMessages((m) => [...m, { role: "user", text: msg }]);
    setInput("");
    setSending(true);
    try {
      const { data } = await api.post("/advisor/ask", { message: msg });
      setMessages((m) => [...m, { role: "sage", text: data.reply }]);
    } catch (err) {
      toast.error(formatApiError(err.response?.data?.detail) || "Sage is unreachable");
    } finally {
      setSending(false);
    }
  };

  return (
    <div className="space-y-6 animate-fade-up max-w-4xl">
      <header className="flex items-center gap-3">
        <div className="w-12 h-12 rounded-full bg-moss flex items-center justify-center">
          <Leaf className="w-6 h-6 text-white" />
        </div>
        <div>
          <h1 className="font-display text-4xl font-bold tracking-tight">Sage</h1>
          <p className="text-sm text-muted-foreground">Your AI budget companion. Powered by Claude.</p>
        </div>
      </header>

      <Card className="rounded-2xl border-border">
        <CardContent className="p-0">
          <div ref={scrollRef} className="h-[450px] overflow-y-auto p-6 space-y-4" data-testid="advisor-messages">
            {messages.map((m, i) => (
              <div key={i} className={`flex ${m.role === "user" ? "justify-end" : "justify-start"}`}>
                <div className={`max-w-[80%] px-4 py-3 rounded-2xl text-sm leading-relaxed whitespace-pre-wrap ${
                  m.role === "user" ? "bg-moss text-white rounded-br-sm" : "bg-sage text-foreground rounded-bl-sm"
                }`}>
                  {m.text}
                </div>
              </div>
            ))}
            {sending && (
              <div className="flex justify-start">
                <div className="bg-sage text-muted-foreground px-4 py-3 rounded-2xl text-sm rounded-bl-sm">
                  Sage is thinking…
                </div>
              </div>
            )}
          </div>

          <div className="border-t border-border p-4">
            <div className="flex gap-2 flex-wrap mb-3">
              {STARTERS.map((s, i) => (
                <Button key={i} variant="outline" size="sm" className="rounded-full text-xs" onClick={() => send(s)} disabled={sending} data-testid={`starter-${i}`}>
                  {s}
                </Button>
              ))}
            </div>
            <form onSubmit={(e) => { e.preventDefault(); send(); }} className="flex gap-2">
              <Input
                placeholder="Ask Sage about your money…"
                value={input}
                onChange={(e) => setInput(e.target.value)}
                className="rounded-full"
                disabled={sending}
                data-testid="advisor-input"
              />
              <Button type="submit" disabled={sending || !input.trim()} className="rounded-full bg-moss hover:bg-moss-hover" data-testid="advisor-send-button">
                <Send className="w-4 h-4" />
              </Button>
            </form>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
