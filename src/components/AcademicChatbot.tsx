import React, { useState, useRef, useEffect } from 'react';
import {
  Bot,
  Send,
  Sparkles,
  MapPin,
  BookOpen,
  X,
  ExternalLink,
  Loader2,
  Globe,
  Video,
  Film,
  Download,
  Compass,
  Search,
  AlertCircle,
  CheckCircle2,
  Play,
  Layers,
} from 'lucide-react';

export type GroundingMode = 'auto' | 'search' | 'maps';

interface WebSource {
  title: string;
  uri: string;
}

interface MapSource {
  title: string;
  uri: string;
  reviewSnippets?: string[];
}

interface GeneratedVideo {
  videoUrl: string;
  aspectRatio: '16:9' | '9:16';
  duration: '5s' | '10s';
  prompt: string;
}

interface ChatMessage {
  id: string;
  role: 'user' | 'model';
  text: string;
  groundingUsed?: 'search' | 'maps' | 'standard';
  webSources?: WebSource[];
  mapSources?: MapSource[];
  video?: GeneratedVideo;
  timestamp: string;
}

interface AcademicChatbotProps {
  isOpen: boolean;
  onClose: () => void;
}

const PRESET_DOUBTS: Array<{
  label: string;
  prompt: string;
  mode: GroundingMode;
  badge: string;
}> = [
  {
    label: 'SN1 vs SN2 Stereochemistry',
    prompt:
      'Explain the stereochemical difference between SN1 and SN2 nucleophilic substitution reactions with energy profile diagrams and solvent effects.',
    mode: 'search',
    badge: 'Search',
  },
  {
    label: '1H NMR Chemical Shifts',
    prompt:
      'How do anisotropic shielding effects change 1H NMR chemical shifts in aromatic rings, alkenes, and aldehydes? Include standard ppm ranges.',
    mode: 'search',
    badge: 'Search',
  },
  {
    label: 'Crystal Field Splitting',
    prompt:
      'Explain d-orbital splitting in octahedral vs tetrahedral coordination complexes and how spectrochemical series ligands affect CFSE.',
    mode: 'search',
    badge: 'Search',
  },
  {
    label: 'CUK Science Block & Library Map',
    prompt:
      'Where is the Central Library and Science Block located at Central University of Karnataka, Kadaganchi campus, and what facilities are nearby?',
    mode: 'maps',
    badge: 'Maps',
  },
  {
    label: 'UGC 75% Attendance Rule',
    prompt:
      'What is the UGC 75% attendance ordinance for university laboratory and theory semester exams at Central University of Karnataka?',
    mode: 'search',
    badge: 'Search',
  },
];

const PRESET_VIDEO_PROMPTS: Array<{
  title: string;
  prompt: string;
  aspectRatio: '16:9' | '9:16';
}> = [
  {
    title: 'SN2 Backside Nucleophilic Attack',
    prompt:
      '3D molecular animation of an SN2 bimolecular nucleophilic substitution reaction showing hydroxide ion attacking bromomethane from the backside, passing through a planar pentacoordinate transition state with umbrella Walden inversion of stereochemistry.',
    aspectRatio: '16:9',
  },
  {
    title: 'Fractional Distillation Apparatus',
    prompt:
      'Clear laboratory demonstration of a glass fractional distillation setup with a round-bottom flask, Vigreux fractionating column, Liebig condenser with cooling water flow, and thermometer separating a binary liquid mixture.',
    aspectRatio: '16:9',
  },
  {
    title: 'Octahedral d-Orbital Splitting',
    prompt:
      '3D quantum chemistry visualization of five degenerate d-orbitals splitting into lower energy t2g orbitals and higher energy eg orbitals as six octahedral ligands approach a central transition metal ion.',
    aspectRatio: '9:16',
  },
  {
    title: 'Acid-Base Titration Endpoint',
    prompt:
      'Close-up analytical chemistry laboratory view of a burette adding sodium hydroxide drop by drop into a swirling Erlenmeyer flask containing hydrochloric acid and phenolphthalein indicator turning faint permanent pink at the equivalence point.',
    aspectRatio: '9:16',
  },
];

export const AcademicChatbot: React.FC<AcademicChatbotProps> = ({ isOpen, onClose }) => {
  const [activeWorkspace, setActiveWorkspace] = useState<'chat' | 'video'>('chat');
  const [groundingMode, setGroundingMode] = useState<GroundingMode>('auto');
  const [userCoords, setUserCoords] = useState<{ latitude: number; longitude: number } | null>(null);

  const [messages, setMessages] = useState<ChatMessage[]>([
    {
      id: 'msg-init',
      role: 'model',
      text: `Welcome to the **CUK Chemistry Academic & Campus Reference**! I resolve academic and campus queries across three integrated areas:

• **Chemistry Reference**: Reaction mechanisms (SN1/SN2), 1H NMR spectroscopy tables, Crystal Field Theory, and IUPAC standards.
• **Campus Guide**: CUK Kadaganchi campus navigation, Science Block labs, Central Library, and 500m geofence perimeter rules.
• **Attendance Ordinance**: UGC 75% eligibility calculation, session passcodes, and verification receipts.

Select a quick topic below or ask a question!`,
      groundingUsed: 'search',
      timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
    },
  ]);

  const [inputPrompt, setInputPrompt] = useState<string>('');
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [errorNotice, setErrorNotice] = useState<string | null>(null);

  // Video Generation Studio State
  const [videoPrompt, setVideoPrompt] = useState<string>(PRESET_VIDEO_PROMPTS[0].prompt);
  const [aspectRatio, setAspectRatio] = useState<'16:9' | '9:16'>('16:9');
  const [videoDuration, setVideoDuration] = useState<'5s' | '10s'>('5s');
  const [isGeneratingVideo, setIsGeneratingVideo] = useState<boolean>(false);
  const [videoError, setVideoError] = useState<string | null>(null);
  const [generatedVideos, setGeneratedVideos] = useState<GeneratedVideo[]>([]);

  const messagesEndRef = useRef<HTMLDivElement>(null);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    if (isOpen && activeWorkspace === 'chat') {
      scrollToBottom();
    }
  }, [messages, isOpen, activeWorkspace]);

  // Acquire browser geolocation when Maps grounding is used
  useEffect(() => {
    if (isOpen && 'geolocation' in navigator && !userCoords) {
      navigator.geolocation.getCurrentPosition(
        (pos) => {
          setUserCoords({
            latitude: pos.coords.latitude,
            longitude: pos.coords.longitude,
          });
        },
        () => {
          // Fallback to CUK Kadaganchi coordinates handled on server
        },
        { timeout: 5000 }
      );
    }
  }, [isOpen, userCoords]);

  const handleSendMessage = async (textToSend?: string, overrideMode?: GroundingMode) => {
    const text = (textToSend || inputPrompt).trim();
    if (!text || isLoading) return;

    const effectiveMode = overrideMode || groundingMode;
    if (overrideMode) {
      setGroundingMode(overrideMode);
    }

    const userMessage: ChatMessage = {
      id: `user-${Date.now()}`,
      role: 'user',
      text,
      timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
    };

    const updatedMessages = [...messages, userMessage];
    setMessages(updatedMessages);
    setInputPrompt('');
    setIsLoading(true);
    setErrorNotice(null);

    try {
      const payloadMessages = updatedMessages.map((m) => ({
        role: m.role,
        text: m.text,
      }));

      const res = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          messages: payloadMessages,
          groundingMode: effectiveMode,
          userLocation: userCoords,
        }),
      });

      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(data.error || `Server responded with status ${res.status}`);
      }

      const modelMessage: ChatMessage = {
        id: `model-${Date.now()}`,
        role: 'model',
        text: data.text,
        groundingUsed: data.groundingUsed || (effectiveMode === 'maps' ? 'maps' : 'search'),
        webSources: data.webSources || [],
        mapSources: data.mapSources || [],
        timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      };

      setMessages((prev) => [...prev, modelMessage]);
    } catch (err: any) {
      console.error('Academic doubt chat error:', err);
      const errMsg = err.message || 'Unable to connect to academic reference server.';
      setErrorNotice(errMsg);
      setMessages((prev) => [
        ...prev,
        {
          id: `model-err-${Date.now()}`,
          role: 'model',
          text: `I encountered an issue processing your academic doubt: ${errMsg}`,
          timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
        },
      ]);
    } finally {
      setIsLoading(false);
    }
  };

  const handleGenerateVideo = async (customPrompt?: string) => {
    const targetPrompt = (customPrompt || videoPrompt).trim();
    if (!targetPrompt || isGeneratingVideo) return;

    setIsGeneratingVideo(true);
    setVideoError(null);

    try {
      const res = await fetch('/api/doubt-video', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          prompt: targetPrompt,
          aspectRatio,
          duration: videoDuration,
        }),
      });

      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(data.error || `Video generation failed with status ${res.status}`);
      }

      const byteCharacters = atob(data.videoData);
      const byteNumbers = new Array(byteCharacters.length);
      for (let i = 0; i < byteCharacters.length; i++) {
        byteNumbers[i] = byteCharacters.charCodeAt(i);
      }
      const byteArray = new Uint8Array(byteNumbers);
      const blob = new Blob([byteArray], { type: data.mimeType || 'video/mp4' });
      const videoUrl = URL.createObjectURL(blob);

      const newVideo: GeneratedVideo = {
        videoUrl,
        aspectRatio: data.aspectRatio || aspectRatio,
        duration: data.duration || videoDuration,
        prompt: targetPrompt,
      };

      setGeneratedVideos((prev) => [newVideo, ...prev]);

      // Also append to the chat thread so the student has it in their conversation history
      setMessages((prev) => [
        ...prev,
        {
          id: `model-vid-${Date.now()}`,
          role: 'model',
          text: `🎬 **Generated Visual Explanation (${newVideo.aspectRatio}, ${newVideo.duration})**:\n"${targetPrompt}"`,
          video: newVideo,
          timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
        },
      ]);
    } catch (err: any) {
      console.error('Video generation error:', err);
      setVideoError(
        err.message ||
          'Video synthesis is unavailable in standalone attendance portal mode.'
      );
    } finally {
      setIsGeneratingVideo(false);
    }
  };

  const openVideoStudioWithConcept = (conceptText: string) => {
    const cleaned = conceptText.replace(/\s+/g, ' ').slice(0, 260);
    setVideoPrompt(`3D scientific chemistry visualization explaining: ${cleaned}`);
    setActiveWorkspace('video');
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-y-0 right-0 z-50 w-full sm:w-[540px] bg-white shadow-2xl border-l border-slate-200 flex flex-col animate-in slide-in-from-right duration-200">
      {/* Top Header */}
      <div className="bg-slate-900 text-white p-4 flex items-center justify-between border-b border-slate-800">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-lg bg-indigo-600 flex items-center justify-center font-bold shadow-xs">
            <Bot className="w-5 h-5 text-white" />
          </div>
          <div>
            <div className="text-xs font-bold uppercase tracking-wider text-indigo-300 flex items-center gap-1.5">
              <span>CUK Academic Reference Desk</span>
              <span className="px-1.5 py-0.5 text-[9px] rounded bg-indigo-500/30 text-indigo-200 border border-indigo-400/30">
                CUK Chem
              </span>
            </div>
            <div className="text-[11px] text-slate-300 flex items-center gap-1.5 mt-0.5">
              <span>Search Grounding</span>
              <span aria-hidden="true">·</span>
              <span>Maps Grounding</span>
              <span aria-hidden="true">·</span>
              <span>Omni Video</span>
            </div>
          </div>
        </div>

        <button
          type="button"
          onClick={onClose}
          className="cursor-pointer text-slate-400 hover:text-white p-1.5 rounded-lg hover:bg-slate-800 transition-colors"
          aria-label="Close Academic Doubt Solver"
        >
          <X className="w-5 h-5" />
        </button>
      </div>

      {/* Primary Workspace Switcher: Grounded Doubt Chat vs. AI Video Concept Studio */}
      <div className="bg-slate-900 px-4 pb-3 flex items-center gap-2 border-b border-slate-800">
        <button
          type="button"
          onClick={() => setActiveWorkspace('chat')}
          className={`flex-1 py-2 px-3 rounded-lg text-xs font-semibold flex items-center justify-center gap-1.5 cursor-pointer transition-all ${
            activeWorkspace === 'chat'
              ? 'bg-indigo-600 text-white shadow-xs'
              : 'bg-slate-800 text-slate-300 hover:bg-slate-700'
          }`}
        >
          <Search className="w-3.5 h-3.5" />
          <span>Search & Maps Doubt Chat</span>
        </button>
        <button
          type="button"
          onClick={() => setActiveWorkspace('video')}
          className={`flex-1 py-2 px-3 rounded-lg text-xs font-semibold flex items-center justify-center gap-1.5 cursor-pointer transition-all ${
            activeWorkspace === 'video'
              ? 'bg-emerald-600 text-white shadow-xs'
              : 'bg-slate-800 text-slate-300 hover:bg-slate-700'
          }`}
        >
          <Video className="w-3.5 h-3.5" />
          <span>Video Concept Studio</span>
          {generatedVideos.length > 0 && (
            <span className="px-1.5 py-0.2 bg-white/20 rounded text-[10px]">
              {generatedVideos.length}
            </span>
          )}
        </button>
      </div>

      {activeWorkspace === 'chat' ? (
        <>
          {/* Grounding Tool Mode Bar */}
          <div className="bg-slate-50 border-b border-slate-200 px-3.5 py-2.5 flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-1 text-[11px] font-semibold text-slate-600">
              <Layers className="w-3.5 h-3.5 text-indigo-600" />
              <span>Grounding Engine:</span>
            </div>
            <div className="flex items-center gap-1 bg-slate-200/80 p-0.5 rounded-lg">
              <button
                type="button"
                onClick={() => setGroundingMode('auto')}
                className={`cursor-pointer px-2.5 py-1 rounded-md text-[11px] font-semibold transition-all flex items-center gap-1 ${
                  groundingMode === 'auto'
                    ? 'bg-white text-slate-900 shadow-2xs'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                <Sparkles className="w-3 h-3 text-indigo-600" />
                <span>Smart Auto</span>
              </button>
              <button
                type="button"
                onClick={() => setGroundingMode('search')}
                className={`cursor-pointer px-2.5 py-1 rounded-md text-[11px] font-semibold transition-all flex items-center gap-1 ${
                  groundingMode === 'search'
                    ? 'bg-white text-indigo-700 shadow-2xs'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                <Globe className="w-3 h-3 text-indigo-600" />
                <span>Google Search</span>
              </button>
              <button
                type="button"
                onClick={() => setGroundingMode('maps')}
                className={`cursor-pointer px-2.5 py-1 rounded-md text-[11px] font-semibold transition-all flex items-center gap-1 ${
                  groundingMode === 'maps'
                    ? 'bg-white text-emerald-700 shadow-2xs'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                <MapPin className="w-3 h-3 text-emerald-600" />
                <span>Google Maps</span>
              </button>
            </div>
          </div>

          {/* Preset Doubt Chips */}
          <div className="bg-white border-b border-slate-200 px-3 py-2 flex items-center gap-1.5 overflow-x-auto text-[11px] whitespace-nowrap">
            <span className="text-slate-400 font-semibold px-1 shrink-0">Doubts:</span>
            {PRESET_DOUBTS.map((item, idx) => (
              <button
                key={idx}
                type="button"
                onClick={() => handleSendMessage(item.prompt, item.mode)}
                disabled={isLoading}
                className="cursor-pointer px-2.5 py-1 bg-slate-50 border border-slate-200 hover:border-indigo-300 rounded-md text-slate-700 hover:text-indigo-700 transition-colors flex items-center gap-1.5 shrink-0"
              >
                <span
                  className={`w-1.5 h-1.5 rounded-full ${
                    item.mode === 'maps' ? 'bg-emerald-500' : 'bg-indigo-500'
                  }`}
                />
                <span>{item.label}</span>
              </button>
            ))}
          </div>

          {/* Error Banner if any */}
          {errorNotice && (
            <div className="mx-4 mt-3 p-2.5 rounded-lg bg-amber-50 border border-amber-200 text-amber-800 text-[11px] flex items-start gap-2">
              <AlertCircle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
              <div className="flex-1">{errorNotice}</div>
              <button
                type="button"
                onClick={() => setErrorNotice(null)}
                className="text-amber-600 hover:text-amber-900 cursor-pointer"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </div>
          )}

          {/* Scrollable Message Thread */}
          <div className="flex-1 overflow-y-auto p-4 space-y-4 text-xs">
            {messages.map((msg) => (
              <div
                key={msg.id}
                className={`flex flex-col ${msg.role === 'user' ? 'items-end' : 'items-start'}`}
              >
                <div className="flex items-center gap-1.5 mb-1 text-[10px] text-slate-400">
                  {msg.role === 'user' ? (
                    <>
                      <span className="font-semibold text-slate-600">Scholar</span>
                      <span>·</span>
                      <span className="font-mono">{msg.timestamp}</span>
                    </>
                  ) : (
                    <>
                      <Bot className="w-3 h-3 text-indigo-600" />
                      <span className="font-semibold text-slate-700">CUK Doubt Solver</span>
                      {msg.groundingUsed === 'search' && (
                        <span className="px-1.5 py-0.2 bg-indigo-50 text-indigo-700 border border-indigo-200 rounded text-[9px] font-semibold flex items-center gap-1">
                          <Globe className="w-2.5 h-2.5" />
                          Search Grounded
                        </span>
                      )}
                      {msg.groundingUsed === 'maps' && (
                        <span className="px-1.5 py-0.2 bg-emerald-50 text-emerald-700 border border-emerald-200 rounded text-[9px] font-semibold flex items-center gap-1">
                          <MapPin className="w-2.5 h-2.5" />
                          Maps Grounded
                        </span>
                      )}
                      <span>·</span>
                      <span className="font-mono">{msg.timestamp}</span>
                    </>
                  )}
                </div>

                <div
                  className={`max-w-[92%] p-3.5 rounded-xl leading-relaxed whitespace-pre-wrap ${
                    msg.role === 'user'
                      ? 'bg-indigo-600 text-white rounded-tr-xs'
                      : 'bg-slate-100 text-slate-800 rounded-tl-xs border border-slate-200/90'
                  }`}
                >
                  {msg.text}

                  {/* Embedded Video Player if message has a generated video */}
                  {msg.video && (
                    <div className="mt-3 pt-2.5 border-t border-slate-200/80">
                      <div className="rounded-lg overflow-hidden bg-slate-950 border border-slate-800">
                        <video
                          src={msg.video.videoUrl}
                          controls
                          autoPlay
                          loop
                          playsInline
                          className={`w-full ${
                            msg.video.aspectRatio === '9:16'
                              ? 'max-h-[360px] object-contain mx-auto'
                              : 'aspect-video object-cover'
                          }`}
                        />
                      </div>
                      <div className="mt-2 flex items-center justify-between text-[11px] text-slate-600">
                        <span className="font-mono">
                          gemini-omni-1.1-flash · {msg.video.aspectRatio}
                        </span>
                        <a
                          href={msg.video.videoUrl}
                          download={`cuk-chemistry-doubt-${Date.now()}.mp4`}
                          className="inline-flex items-center gap-1 font-semibold text-indigo-600 hover:text-indigo-800"
                        >
                          <Download className="w-3 h-3" />
                          <span>Download MP4</span>
                        </a>
                      </div>
                    </div>
                  )}

                  {/* Display Google Search Grounding Web Links */}
                  {msg.webSources && msg.webSources.length > 0 && (
                    <div className="mt-3 pt-2.5 border-t border-slate-200/80 space-y-1.5">
                      <div className="font-bold text-[10px] uppercase tracking-wider text-indigo-700 flex items-center gap-1">
                        <Globe className="w-3 h-3 text-indigo-600" />
                        Google Search Grounded Citations ({msg.webSources.length}):
                      </div>
                      <div className="flex flex-wrap gap-1.5">
                        {msg.webSources.map((source, i) => (
                          <a
                            key={i}
                            href={source.uri}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="inline-flex items-center gap-1 text-[11px] text-indigo-700 hover:text-indigo-900 hover:underline bg-white px-2.5 py-1 rounded-md border border-indigo-200 shadow-2xs max-w-full truncate"
                          >
                            <span className="truncate max-w-[220px]">{source.title}</span>
                            <ExternalLink className="w-2.5 h-2.5 shrink-0" />
                          </a>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Display Google Maps Grounding Links & Review Snippets */}
                  {msg.mapSources && msg.mapSources.length > 0 && (
                    <div className="mt-3 pt-2.5 border-t border-slate-200/80 space-y-2">
                      <div className="font-bold text-[10px] uppercase tracking-wider text-emerald-700 flex items-center gap-1">
                        <MapPin className="w-3 h-3 text-emerald-600" />
                        Google Maps Grounded Locations:
                      </div>
                      <div className="space-y-1.5">
                        {msg.mapSources.map((source, i) => (
                          <div
                            key={i}
                            className="bg-white p-2 rounded-md border border-emerald-200 shadow-2xs"
                          >
                            <a
                              href={source.uri}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="inline-flex items-center gap-1 text-[11px] font-semibold text-emerald-700 hover:text-emerald-900 hover:underline"
                            >
                              <Compass className="w-3 h-3 text-emerald-600 shrink-0" />
                              <span>{source.title}</span>
                              <ExternalLink className="w-2.5 h-2.5 shrink-0" />
                            </a>
                            {source.reviewSnippets && source.reviewSnippets.length > 0 && (
                              <div className="mt-1 pl-4 space-y-1 text-[10px] text-slate-600 italic">
                                {source.reviewSnippets.map((snip, sIdx) => (
                                  <p key={sIdx}>"{snip}"</p>
                                ))}
                              </div>
                            )}
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Quick action to turn any answer or user doubt into an AI Video explanation */}
                  {msg.id !== 'msg-init' && !msg.video && (
                    <div className="mt-2.5 pt-2 border-t border-slate-200/60 flex justify-end">
                      <button
                        type="button"
                        onClick={() => openVideoStudioWithConcept(msg.text)}
                        className={`cursor-pointer inline-flex items-center gap-1 text-[10px] font-semibold px-2 py-1 rounded transition-colors ${
                          msg.role === 'user'
                            ? 'bg-indigo-700 hover:bg-indigo-800 text-indigo-100'
                            : 'bg-white hover:bg-emerald-50 text-emerald-700 border border-emerald-200'
                        }`}
                      >
                        <Film className="w-3 h-3" />
                        <span>Visualize as AI Video (16:9 / 9:16)</span>
                      </button>
                    </div>
                  )}
                </div>
              </div>
            ))}

            {isLoading && (
              <div className="flex items-center gap-2 text-slate-600 text-xs py-2 px-3 bg-slate-50 rounded-lg border border-slate-200 w-fit">
                <Loader2 className="w-4 h-4 animate-spin text-indigo-600" />
                <span>
                  {groundingMode === 'maps'
                    ? 'Querying Google Maps Grounding (gemini-3.8-flash)...'
                    : 'Searching scientific literature & Google Search Grounding (gemini-3.8-flash)...'}
                </span>
              </div>
            )}

            <div ref={messagesEndRef} />
          </div>

          {/* Input Bar */}
          <div className="p-3 bg-white border-t border-slate-200">
            <form
              onSubmit={(e) => {
                e.preventDefault();
                handleSendMessage();
              }}
              className="flex items-center gap-2"
            >
              <input
                type="text"
                value={inputPrompt}
                onChange={(e) => setInputPrompt(e.target.value)}
                placeholder={
                  groundingMode === 'maps'
                    ? 'Ask about CUK campus labs, hostels, or nearby places...'
                    : 'Ask any Chemistry, Spectroscopy, CSIR-NET, or Campus doubt...'
                }
                disabled={isLoading}
                className="flex-1 px-3 py-2 text-xs border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
              />
              <button
                type="submit"
                disabled={!inputPrompt.trim() || isLoading}
                className="cursor-pointer px-3.5 py-2 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-40 text-white rounded-lg transition-colors flex items-center justify-center shadow-xs"
                title="Send Academic Doubt"
              >
                <Send className="w-4 h-4" />
              </button>
            </form>
          </div>
        </>
      ) : (
        /* AI Video Concept Studio (gemini-omni-1.1-flash via Interactions API) */
        <div className="flex-1 overflow-y-auto p-4 space-y-4 text-xs bg-slate-50">
          <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-2xs space-y-3.5">
            <div className="flex items-start justify-between gap-2">
              <div>
                <h3 className="text-sm font-bold text-slate-900 flex items-center gap-1.5">
                  <Film className="w-4 h-4 text-emerald-600" />
                  <span>Academic Doubt Video Generator</span>
                </h3>
                <p className="text-[11px] text-slate-500 mt-0.5">
                  Powered by <code className="font-mono text-emerald-700">gemini-omni-1.1-flash</code> via the Interactions API. Generate visual 3D molecular mechanisms or lab demonstrations.
                </p>
              </div>
            </div>

            {/* Preset Chemistry Video Concepts */}
            <div>
              <label className="block text-[11px] font-semibold text-slate-600 mb-1.5">
                Quick Chemistry Visualization Templates:
              </label>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5">
                {PRESET_VIDEO_PROMPTS.map((preset, i) => (
                  <button
                    key={i}
                    type="button"
                    onClick={() => {
                      setVideoPrompt(preset.prompt);
                      setAspectRatio(preset.aspectRatio);
                    }}
                    disabled={isGeneratingVideo}
                    className="cursor-pointer text-left p-2 rounded-lg border border-slate-200 hover:border-emerald-400 bg-slate-50/70 hover:bg-emerald-50/40 transition-colors"
                  >
                    <div className="font-semibold text-slate-800 text-[11px] flex items-center justify-between">
                      <span className="truncate">{preset.title}</span>
                      <span className="text-[9px] font-mono px-1.5 py-0.2 bg-slate-200 text-slate-700 rounded">
                        {preset.aspectRatio}
                      </span>
                    </div>
                  </button>
                ))}
              </div>
            </div>

            {/* Video Prompt Textarea */}
            <div>
              <label className="block text-[11px] font-semibold text-slate-700 mb-1">
                Describe the Academic / Chemistry Concept to Visualize:
              </label>
              <textarea
                rows={4}
                value={videoPrompt}
                onChange={(e) => setVideoPrompt(e.target.value)}
                disabled={isGeneratingVideo}
                placeholder="Describe the reaction mechanism, molecular orbital, or laboratory apparatus you want to visualize..."
                className="w-full p-2.5 text-xs border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-500 bg-white text-slate-800"
              />
            </div>

            {/* Aspect Ratio ('16:9' or '9:16') & Duration Controls */}
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-[11px] font-semibold text-slate-700 mb-1">
                  Aspect Ratio (Required):
                </label>
                <div className="grid grid-cols-2 gap-1.5">
                  <button
                    type="button"
                    onClick={() => setAspectRatio('16:9')}
                    disabled={isGeneratingVideo}
                    className={`cursor-pointer py-2 px-2.5 rounded-lg border text-xs font-semibold flex items-center justify-center gap-1.5 transition-all ${
                      aspectRatio === '16:9'
                        ? 'bg-emerald-600 text-white border-emerald-600 shadow-2xs'
                        : 'bg-white text-slate-700 border-slate-300 hover:bg-slate-50'
                    }`}
                  >
                    <span className="w-4 h-2.5 border border-current rounded-2xs inline-block" />
                    <span>16:9 Landscape</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setAspectRatio('9:16')}
                    disabled={isGeneratingVideo}
                    className={`cursor-pointer py-2 px-2.5 rounded-lg border text-xs font-semibold flex items-center justify-center gap-1.5 transition-all ${
                      aspectRatio === '9:16'
                        ? 'bg-emerald-600 text-white border-emerald-600 shadow-2xs'
                        : 'bg-white text-slate-700 border-slate-300 hover:bg-slate-50'
                    }`}
                  >
                    <span className="w-2.5 h-4 border border-current rounded-2xs inline-block" />
                    <span>9:16 Portrait</span>
                  </button>
                </div>
              </div>

              <div>
                <label className="block text-[11px] font-semibold text-slate-700 mb-1">
                  Clip Duration:
                </label>
                <div className="grid grid-cols-2 gap-1.5">
                  <button
                    type="button"
                    onClick={() => setVideoDuration('5s')}
                    disabled={isGeneratingVideo}
                    className={`cursor-pointer py-2 px-2.5 rounded-lg border text-xs font-semibold transition-all ${
                      videoDuration === '5s'
                        ? 'bg-slate-900 text-white border-slate-900'
                        : 'bg-white text-slate-700 border-slate-300 hover:bg-slate-50'
                    }`}
                  >
                    5 Seconds
                  </button>
                  <button
                    type="button"
                    onClick={() => setVideoDuration('10s')}
                    disabled={isGeneratingVideo}
                    className={`cursor-pointer py-2 px-2.5 rounded-lg border text-xs font-semibold transition-all ${
                      videoDuration === '10s'
                        ? 'bg-slate-900 text-white border-slate-900'
                        : 'bg-white text-slate-700 border-slate-300 hover:bg-slate-50'
                    }`}
                  >
                    10 Seconds
                  </button>
                </div>
              </div>
            </div>

            {videoError && (
              <div className="p-3 rounded-lg bg-amber-50 border border-amber-200 text-amber-900 text-xs flex items-start gap-2">
                <AlertCircle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
                <div className="flex-1 leading-relaxed">{videoError}</div>
              </div>
            )}

            <button
              type="button"
              onClick={() => handleGenerateVideo()}
              disabled={!videoPrompt.trim() || isGeneratingVideo}
              className="w-full cursor-pointer py-2.5 px-4 bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white font-semibold rounded-lg shadow-xs transition-colors flex items-center justify-center gap-2"
            >
              {isGeneratingVideo ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  <span>Synthesizing {aspectRatio} Video with gemini-omni-1.1-flash...</span>
                </>
              ) : (
                <>
                  <Play className="w-4 h-4 fill-current" />
                  <span>Generate {aspectRatio} Academic Concept Video</span>
                </>
              )}
            </button>
          </div>

          {/* Generated Videos Gallery */}
          {generatedVideos.length > 0 && (
            <div className="space-y-3">
              <h4 className="text-xs font-bold uppercase tracking-wider text-slate-500">
                Generated Doubt Visualizations ({generatedVideos.length})
              </h4>
              {generatedVideos.map((vid, idx) => (
                <div
                  key={idx}
                  className="bg-white p-3.5 rounded-xl border border-slate-200 shadow-2xs space-y-2.5"
                >
                  <div className="flex items-center justify-between text-[11px]">
                    <span className="font-bold text-emerald-700 flex items-center gap-1">
                      <CheckCircle2 className="w-3.5 h-3.5" />
                      <span>
                        {vid.aspectRatio === '16:9' ? '16:9 Landscape' : '9:16 Portrait'} · {vid.duration} · 720p
                      </span>
                    </span>
                    <a
                      href={vid.videoUrl}
                      download={`cuk-chemistry-doubt-${idx + 1}.mp4`}
                      className="inline-flex items-center gap-1 font-semibold text-indigo-600 hover:text-indigo-800"
                    >
                      <Download className="w-3.5 h-3.5" />
                      <span>Download MP4</span>
                    </a>
                  </div>

                  <div className="rounded-lg overflow-hidden bg-slate-950 border border-slate-800">
                    <video
                      src={vid.videoUrl}
                      controls
                      autoPlay
                      loop
                      playsInline
                      className={`w-full ${
                        vid.aspectRatio === '9:16'
                          ? 'max-h-[400px] object-contain mx-auto'
                          : 'aspect-video object-cover'
                      }`}
                    />
                  </div>

                  <p className="text-[11px] text-slate-600 leading-relaxed">{vid.prompt}</p>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
};
