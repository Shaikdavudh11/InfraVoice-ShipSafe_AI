export type VoiceLanguageCode = 'en-IN' | 'hi-IN' | 'te-IN' | 'ta-IN' | 'kn-IN';

export interface VoiceLanguageOption {
  code: VoiceLanguageCode;
  label: string;
  nativeLabel: string;
}

export const SUPPORTED_VOICE_LANGUAGES: VoiceLanguageOption[] = [
  { code: 'en-IN', label: 'English (India)', nativeLabel: 'English' },
  { code: 'hi-IN', label: 'Hindi', nativeLabel: 'हिन्दी' },
  { code: 'te-IN', label: 'Telugu', nativeLabel: 'తెలుగు' },
  { code: 'ta-IN', label: 'Tamil', nativeLabel: 'தமிழ்' },
  { code: 'kn-IN', label: 'Kannada', nativeLabel: 'ಕನ್ನಡ' },
];

export interface SpeechRecognitionLike {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  onresult: ((event: SpeechRecognitionEventLike) => void) | null;
  onerror: ((event: { error?: string }) => void) | null;
  onend: (() => void) | null;
  start: () => void;
  stop: () => void;
  abort?: () => void;
}

export interface SpeechRecognitionEventLike {
  results: ArrayLike<{
    isFinal?: boolean;
    0: { transcript: string };
  }>;
}

type SpeechRecognitionConstructor = new () => SpeechRecognitionLike;

export function getSpeechRecognitionConstructor(): SpeechRecognitionConstructor | null {
  if (typeof window === 'undefined') return null;
  const w = window as unknown as {
    SpeechRecognition?: SpeechRecognitionConstructor;
    webkitSpeechRecognition?: SpeechRecognitionConstructor;
  };
  return w.SpeechRecognition || w.webkitSpeechRecognition || null;
}

export function isSpeechRecognitionSupported(): boolean {
  return getSpeechRecognitionConstructor() !== null;
}

export function isSpeechSynthesisSupported(): boolean {
  return (
    typeof window !== 'undefined' &&
    'speechSynthesis' in window &&
    typeof window.SpeechSynthesisUtterance !== 'undefined'
  );
}

export function stripMarkdownForSpeech(markdown: string): string {
  return markdown
    .replace(/```[\s\S]*?```/g, ' Code block omitted. ')
    .replace(/`([^`]+)`/g, '$1')
    .replace(/\*\*([^*]+)\*\*/g, '$1')
    .replace(/#{1,6}\s*/g, '')
    .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
    .replace(/\s+/g, ' ')
    .trim();
}

export function speakTextWithBrowser(
  text: string,
  lang: VoiceLanguageCode,
  callbacks: {
    onStart?: () => void;
    onEnd?: () => void;
    onError?: (reason: string) => void;
  }
): () => void {
  if (!isSpeechSynthesisSupported()) {
    callbacks.onError?.('Browser text-to-speech is not supported in this browser.');
    return () => {};
  }

  try {
    window.speechSynthesis.cancel();
    const clean = stripMarkdownForSpeech(text).slice(0, 1800);
    if (!clean) {
      callbacks.onError?.('Nothing speakable in this response.');
      return () => {};
    }

    const utterance = new window.SpeechSynthesisUtterance(clean);
    utterance.lang = lang;
    utterance.rate = 1.0;

    const voices = window.speechSynthesis.getVoices();
    const matchingVoice =
      voices.find((v) => v.lang.toLowerCase() === lang.toLowerCase()) ||
      voices.find((v) => v.lang.toLowerCase().startsWith(lang.split('-')[0].toLowerCase()));
    if (matchingVoice) {
      utterance.voice = matchingVoice;
    }

    utterance.onstart = () => callbacks.onStart?.();
    utterance.onend = () => callbacks.onEnd?.();
    utterance.onerror = () => callbacks.onError?.('Unable to play audio in this browser.');

    window.speechSynthesis.speak(utterance);
    return () => {
      window.speechSynthesis.cancel();
      callbacks.onEnd?.();
    };
  } catch {
    callbacks.onError?.('Browser speech playback failed.');
    return () => {};
  }
}
