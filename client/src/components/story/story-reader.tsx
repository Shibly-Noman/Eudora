"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { Button } from "@/components/ui/button";
import { spokenCharCount } from "@/features/stories/narration-timings";
import type { AgentReply, AskPayload, Story } from "@/features/stories/types";
import { cn } from "@/lib/utils";

const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://127.0.0.1:5000";

const MIC = "\u{1F3A4}";

interface Exchange {
  question: string;
  answer: string;
  pending?: boolean;
}

export interface StoryReaderProps {
  story: Story;
  /**
   * Asks a question. Supplied by the caller because who is asking differs by
   * surface — a signed-in child goes through RTK Query with credentials, an
   * anonymous visitor posts to the demo route with a session token — and that
   * is the only real difference between the two.
   */
  onAsk?: (payload: AskPayload) => Promise<AgentReply>;
  /**
   * Media behind the authenticated routes needs the session cookie, and a
   * cross-origin <audio> or <img> does not send one unless told to. Off for the
   * public demo, whose media is deliberately reachable without a session.
   */
  withCredentials?: boolean;
  /** Rendered under the composer when the surface caps questions. */
  capNotice?: (remaining: number) => string;
}

export function StoryReader({
  story,
  onAsk,
  withCredentials = false,
  capNotice,
}: StoryReaderProps) {
  const [page, setPage] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [spokenChars, setSpokenChars] = useState(0);

  const [question, setQuestion] = useState("");
  const [exchanges, setExchanges] = useState<Exchange[]>([]);
  const [asking, setAsking] = useState(false);
  const [askError, setAskError] = useState<string | null>(null);
  const [turnsLeft, setTurnsLeft] = useState<number | null>(null);
  const [recording, setRecording] = useState(false);

  const audioRef = useRef<HTMLAudioElement | null>(null);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const conversationRef = useRef<string | undefined>(undefined);

  /** Flattened, because a child turns pages rather than chapters. */
  const pages = useMemo(
    () =>
      (story.chapters ?? []).flatMap((chapter) =>
        chapter.segments.map((segment) => ({ chapter, segment })),
      ),
    [story],
  );
  const current = pages[page];

  // Stop whatever is speaking when the page turns, so two segments can never
  // read over each other.
  useEffect(() => {
    audioRef.current?.pause();
    setPlaying(false);
    setSpokenChars(0);
  }, [page]);

  /**
   * Word highlighting, driven by the character timings generated alongside the
   * audio. Reading currentTime each frame rather than running a timer keeps the
   * highlight locked to the audio even if it buffers or the tab throttles.
   */
  useEffect(() => {
    if (!playing) return;
    let frame: number;
    const tick = () => {
      const audio = audioRef.current;
      const timings = current?.segment.narrationTimings;
      if (audio && timings) {
        setSpokenChars(spokenCharCount(timings, audio.currentTime));
      }
      frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [playing, current]);

  const play = useCallback(() => {
    const audio = audioRef.current;
    if (!audio) return;
    if (playing) {
      audio.pause();
      setPlaying(false);
      return;
    }
    void audio.play().then(() => setPlaying(true));
  }, [playing]);

  const send = useCallback(
    async (payload: AskPayload) => {
      setExchanges((prior) => [
        ...prior,
        { question: payload.text ?? `${MIC} …`, answer: "", pending: true },
      ]);
      setAsking(true);
      setAskError(null);

      try {
        if (!onAsk) return;
        const reply = await onAsk({
          ...payload,
          segmentId: current?.segment.id,
          releaseId: story.releaseId,
          conversationId: conversationRef.current,
        });

        conversationRef.current = reply.conversationId;
        setTurnsLeft(reply.turnsRemaining);
        setExchanges((prior) => [
          ...prior.slice(0, -1),
          { question: reply.childText, answer: reply.replyText },
        ]);

        if (reply.replyAudio) {
          void new Audio(`data:${reply.replyAudioMimeType};base64,${reply.replyAudio}`).play();
        }
      } catch (error) {
        setExchanges((prior) => prior.slice(0, -1));
        setAskError((error as Error).message || "Something went wrong — shall we try again?");
      } finally {
        setAsking(false);
      }
    },
    [current, onAsk, story.releaseId],
  );

  /** Push-to-talk: held to record, released to send. */
  const startRecording = useCallback(async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const recorder = new MediaRecorder(stream);
      const chunks: Blob[] = [];
      recorder.ondataavailable = (event) => chunks.push(event.data);
      recorder.onstop = async () => {
        stream.getTracks().forEach((track) => track.stop());
        const blob = new Blob(chunks, { type: recorder.mimeType });
        const bytes = new Uint8Array(await blob.arrayBuffer());
        // Chunked rather than one spread into String.fromCharCode: a few
        // seconds of audio is tens of thousands of arguments, which overflows
        // the call stack.
        let binary = "";
        for (let i = 0; i < bytes.length; i += 8192) {
          binary += String.fromCharCode(...bytes.subarray(i, i + 8192));
        }
        void send({ audio: btoa(binary), audioMimeType: recorder.mimeType });
      };
      recorder.start();
      recorderRef.current = recorder;
      setRecording(true);
    } catch {
      setAskError("I could not reach the microphone — you can type instead.");
    }
  }, [send]);

  const stopRecording = useCallback(() => {
    recorderRef.current?.stop();
    recorderRef.current = null;
    setRecording(false);
  }, []);

  if (!current) {
    return (
      <p className="text-muted-foreground rounded-lg border border-dashed p-8 text-center">
        This story has no pages yet.
      </p>
    );
  }

  const { segment, chapter } = current;
  const artwork = segment.assets.filter((asset) => asset.kind !== "AUDIO");
  const spent = turnsLeft === 0;

  return (
    <div className={cn("grid gap-6", onAsk && "lg:grid-cols-[3fr_2fr]")}>
      {/* The book */}
      <div className="bg-card rounded-2xl border p-6 shadow-sm">
        <div className="flex items-baseline justify-between gap-4">
          <div>
            <h2 className="text-xl font-semibold">{story.title}</h2>
            {chapter.title ? (
              <p className="text-muted-foreground text-sm">{chapter.title}</p>
            ) : null}
          </div>
          <span className="text-muted-foreground shrink-0 text-sm tabular-nums">
            {page + 1} / {pages.length}
          </span>
        </div>

        <div key={segment.id} className="mt-4 grid gap-3" aria-label="Section artwork">
          {artwork.map((asset) => (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              key={asset.id}
              src={API_URL + asset.url}
              alt={asset.altText}
              crossOrigin={withCredentials ? "use-credentials" : undefined}
              className={
                asset.kind === "BACKGROUND"
                  ? "aspect-[3/2] w-full rounded-xl object-cover"
                  : "max-h-[32rem] w-full rounded-xl object-contain"
              }
            />
          ))}
        </div>

        <p className="mt-6 text-lg leading-relaxed">
          {segment.narrationTimings ? (
            <>
              <span>{segment.text.slice(0, spokenChars)}</span>
              <span className="text-muted-foreground/50">{segment.text.slice(spokenChars)}</span>
            </>
          ) : (
            segment.text
          )}
        </p>

        {segment.narrationUrl ? (
          <audio
            ref={audioRef}
            src={`${API_URL}${segment.narrationUrl}`}
            crossOrigin={withCredentials ? "use-credentials" : undefined}
            onEnded={() => {
              setPlaying(false);
              setSpokenChars(segment.text.length);
            }}
            preload="auto"
          />
        ) : null}

        <div className="mt-6 flex items-center gap-2">
          <Button
            variant="outline"
            onClick={() => setPage((p) => Math.max(0, p - 1))}
            disabled={page === 0}
          >
            Back
          </Button>
          <Button onClick={play} disabled={!segment.narrationUrl} className="min-w-28">
            {playing ? "Pause" : "Read to me"}
          </Button>
          <Button
            variant="outline"
            onClick={() => setPage((p) => Math.min(pages.length - 1, p + 1))}
            disabled={page === pages.length - 1}
          >
            Next
          </Button>
        </div>
      </div>

      {/* The conversation */}
      {onAsk && (
      <div className="bg-card flex flex-col rounded-2xl border p-6 shadow-sm">
        <h3 className="text-lg font-semibold">Ask about the story</h3>
        <p className="text-muted-foreground mt-1 text-sm">
          She only knows this story, and only as far as you have read.
        </p>

        <div className="mt-4 flex-1 space-y-4 overflow-y-auto">
          {exchanges.length === 0 ? (
            <p className="text-muted-foreground text-sm">Try asking why something happened.</p>
          ) : null}
          {exchanges.map((exchange, index) => (
            <div key={index} className="space-y-1.5">
              <p className="text-sm font-medium">{exchange.question}</p>
              <p
                className={cn(
                  "bg-muted rounded-lg px-3 py-2 text-sm",
                  exchange.pending && "text-muted-foreground animate-pulse",
                )}
              >
                {exchange.pending ? "thinking…" : exchange.answer}
              </p>
            </div>
          ))}
        </div>

        {askError ? <p className="text-destructive mt-3 text-sm">{askError}</p> : null}

        <form
          className="mt-4 flex gap-2"
          onSubmit={(event) => {
            event.preventDefault();
            const text = question.trim();
            if (!text || asking) return;
            setQuestion("");
            void send({ text });
          }}
        >
          <input
            value={question}
            onChange={(event) => setQuestion(event.target.value)}
            placeholder="Type a question…"
            className="bg-background flex-1 rounded-md border px-3 py-2 text-sm"
            disabled={asking || spent}
          />
          <Button
            type="button"
            variant={recording ? "destructive" : "outline"}
            aria-label="Hold to speak"
            // Pointer events rather than mouse/touch pairs: one set covers
            // mouse, pen and touch, and pointerup still fires if the finger
            // slides off the button mid-question.
            onPointerDown={startRecording}
            onPointerUp={stopRecording}
            onPointerLeave={() => recording && stopRecording()}
            disabled={asking || spent}
          >
            {recording ? "Listening…" : MIC}
          </Button>
          <Button type="submit" disabled={asking || spent}>
            Ask
          </Button>
        </form>

        {capNotice && turnsLeft !== null ? (
          <p className="text-muted-foreground mt-2 text-xs">{capNotice(turnsLeft)}</p>
        ) : null}
      </div>
      )}
    </div>
  );
}
