import { useEffect, useEffectEvent, useState } from "react";
import { sfx } from "../sound.ts";

const KEYS = ["1", "2", "3", "4", "5", "6", "7", "8", "9", "back", "0"];
const LENGTH = 4;

/**
 * Four digits on a pad, over whatever was on screen. The fourth digit sends
 * them: `onPin` answers with a sentence when they were refused (shown, and
 * the pad clears) or null when they were taken, after which the caller
 * closes the pad or asks its next question. The pad never keeps a PIN.
 */
export function PinPad({ title, hint, onPin, onCancel }: { title: string; hint?: string; onPin: (pin: string) => Promise<string | null>; onCancel: () => void }) {
  const [digits, setDigits] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const press = (key: string) => {
    if (busy) return;
    if (key === "back") return setDigits(digits.slice(0, -1));
    if (!/^[0-9]$/.test(key) || digits.length >= LENGTH) return;
    sfx.tap();
    const next = digits + key;
    setDigits(next);
    setError(null);
    if (next.length < LENGTH) return;
    setBusy(true);
    void onPin(next).then((refused) => {
      setBusy(false);
      setDigits("");
      setError(refused);
    });
  };

  const onKey = useEffectEvent((ev: KeyboardEvent) => {
    if (ev.metaKey || ev.ctrlKey || ev.altKey) return;
    if (ev.key === "Escape") onCancel();
    else if (/^[0-9]$/.test(ev.key)) press(ev.key);
    else if (ev.key === "Backspace") press("back");
    else return;
    ev.preventDefault();
  });
  useEffect(() => {
    const key = (ev: KeyboardEvent) => onKey(ev);
    window.addEventListener("keydown", key);
    return () => window.removeEventListener("keydown", key);
  }, []);

  return (
    <div className="fixed inset-0 z-40 flex items-center justify-center overflow-y-auto bg-tube/90 p-4" role="dialog" aria-modal="true" aria-label={title}>
      <div className="panel panel-cyan w-full max-w-sm text-center">
        <p className="font-display glow m-0 text-sm text-cyan">{title}</p>
        {hint && <p className="mt-3 mb-0">{hint}</p>}
        <p className="font-display mt-4 mb-0 flex justify-center gap-3 text-2xl text-magenta" aria-label={`${digits.length} of ${LENGTH} digits typed`}>
          {Array.from({ length: LENGTH }, (_, i) => (
            <span key={i} className="slot" aria-hidden>
              {i < digits.length ? "*" : " "}
            </span>
          ))}
        </p>
        <p role="alert" className="mt-3 mb-0 min-h-[1.5em] text-bad">
          {error}
        </p>
        <div className="mx-auto mt-2 grid max-w-xs grid-cols-3" role="group" aria-label="Number pad">
          {KEYS.map((k) => (
            <button key={k} type="button" className={`btn btn-quiet key ${k === "0" ? "col-span-2" : ""}`} aria-label={k === "back" ? "Rub out" : k} disabled={busy} onClick={() => press(k)}>
              {k === "back" ? "<" : k}
            </button>
          ))}
        </div>
        <button type="button" className="btn btn-quiet mt-4" onClick={onCancel}>
          Cancel
        </button>
      </div>
    </div>
  );
}
