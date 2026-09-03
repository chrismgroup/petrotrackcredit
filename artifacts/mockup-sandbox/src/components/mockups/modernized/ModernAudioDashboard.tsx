import React, { useState } from 'react';
import type { LucideIcon } from 'lucide-react';
import {
  Search,
  Bell,
  User,
  HelpCircle,
  Settings,
  ChevronDown,
  ChevronRight,
  Play,
  Pause,
  SkipBack,
  SkipForward,
  Mic,
  BookOpen,
  Image as ImageIcon,
  Bot,
  Music,
  Globe,
  Sparkles,
  Wand2,
  Library,
  Plus,
  Home,
  Mic2,
  Layers,
  FileAudio,
  Volume2,
  Download,
  MoreHorizontal
} from 'lucide-react';

type SidebarItemProps = {
  icon: LucideIcon;
  label: string;
  active?: boolean;
  badge?: string | null;
};

type ActionCardProps = {
  icon: LucideIcon;
  label: string;
  colorClass: string;
  bgColorClass: string;
};

type VoiceListItemProps = {
  avatar: string;
  name: string;
  traits: string;
  description: string;
};

type ToolCardProps = {
  icon: LucideIcon;
  title: string;
  description: string;
  colorClass: string;
};

const SidebarItem = ({ icon: Icon, label, active = false, badge = null }: SidebarItemProps) => (
  <button
    className={`w-full flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium transition-all ${
      active
        ? 'bg-zinc-900 text-white shadow-sm'
        : 'text-zinc-500 hover:text-zinc-900 hover:bg-zinc-100'
    }`}
  >
    <Icon className="w-4 h-4" />
    <span className="flex-1 text-left">{label}</span>
    {badge && (
      <span className="px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wider bg-zinc-200 text-zinc-600 rounded">
        {badge}
      </span>
    )}
  </button>
);

const ActionCard = ({ icon: Icon, label, colorClass, bgColorClass }: ActionCardProps) => (
  <button className="flex flex-col items-center gap-4 p-6 rounded-2xl bg-white border border-zinc-100 shadow-sm hover:shadow-md hover:border-zinc-200 transition-all group">
    <div
      className={`w-12 h-12 rounded-xl flex items-center justify-center ${bgColorClass} transition-transform group-hover:scale-110`}
    >
      <Icon className={`w-6 h-6 ${colorClass}`} />
    </div>
    <span className="text-sm font-semibold text-zinc-800">{label}</span>
  </button>
);

const VoiceListItem = ({ avatar, name, traits, description }: VoiceListItemProps) => (
  <div className="flex items-start gap-4 p-3 rounded-xl hover:bg-zinc-50 transition-colors group cursor-pointer border border-transparent hover:border-zinc-100">
    <div
      className={`w-10 h-10 rounded-full flex items-center justify-center text-white font-medium shrink-0 shadow-inner`}
      style={{ background: avatar }}
    >
      {name.charAt(0)}
    </div>
    <div className="flex-1 min-w-0">
      <div className="flex items-center justify-between mb-1">
        <h4 className="text-sm font-semibold text-zinc-900 truncate">
          {name} <span className="text-zinc-400 font-normal ml-1">— {traits}</span>
        </h4>
        <button className="opacity-0 group-hover:opacity-100 p-1 text-zinc-400 hover:text-zinc-900 transition-all">
          <Play className="w-4 h-4 fill-current" />
        </button>
      </div>
      <p className="text-xs text-zinc-500 truncate">{description}</p>
    </div>
  </div>
);

const ToolCard = ({ icon: Icon, title, description, colorClass }: ToolCardProps) => (
  <button className="flex items-start gap-4 p-5 rounded-2xl bg-white border border-zinc-100 shadow-sm hover:shadow-md hover:border-zinc-200 transition-all text-left group w-full">
    <div className={`p-3 rounded-xl bg-zinc-50 ${colorClass}`}>
      <Icon className="w-6 h-6" />
    </div>
    <div className="flex-1">
      <h3 className="text-sm font-semibold text-zinc-900 mb-1 flex items-center gap-2">
        {title}
        <ChevronRight className="w-4 h-4 text-zinc-300 group-hover:text-zinc-900 transition-colors ml-auto" />
      </h3>
      <p className="text-xs text-zinc-500 leading-relaxed">{description}</p>
    </div>
  </button>
);

export default function ModernAudioDashboard() {
  const [isPlaying, setIsPlaying] = useState(false);

  return (
    <div className="flex h-screen bg-[#FDFDFC] text-zinc-900 font-sans overflow-hidden">
      {/* Sidebar */}
      <aside className="w-64 border-r border-zinc-100 bg-white/50 backdrop-blur-xl flex flex-col h-full flex-shrink-0">
        <div className="p-4 flex items-center gap-2">
          <div className="w-8 h-8 bg-zinc-900 rounded-lg flex items-center justify-center">
            <Layers className="w-4 h-4 text-white" />
          </div>
          <span className="font-bold text-lg tracking-tight">AudioCraft</span>
        </div>

        <div className="px-4 py-2">
          <button className="w-full flex items-center justify-between px-3 py-2 rounded-lg border border-zinc-200 hover:border-zinc-300 bg-white shadow-sm transition-all text-sm">
            <div className="flex items-center gap-2 font-medium">
              <div className="w-5 h-5 rounded bg-indigo-100 text-indigo-700 flex items-center justify-center text-[10px]">
                S
              </div>
              Studio Workspace
            </div>
            <ChevronDown className="w-4 h-4 text-zinc-400" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-2 py-4 space-y-8 no-scrollbar">
          <div className="space-y-1">
            <SidebarItem icon={Home} label="Home" active />
            <SidebarItem icon={Mic2} label="Voices" />
            <SidebarItem icon={Layers} label="Studio" />
            <SidebarItem icon={FileAudio} label="Projects" badge="New" />
          </div>

          <div>
            <h4 className="px-3 mb-2 text-[10px] font-bold uppercase tracking-wider text-zinc-400">
              Pinned Tools
            </h4>
            <div className="space-y-1">
              <SidebarItem icon={Mic} label="Text to Speech" />
              <SidebarItem icon={Wand2} label="Voice Changer" />
              <SidebarItem icon={Sparkles} label="Sound Effects" />
              <SidebarItem icon={Music} label="Music Gen" />
            </div>
          </div>
        </div>

        <div className="p-4 border-t border-zinc-100">
          <div className="p-4 bg-zinc-50 rounded-xl border border-zinc-100 mb-4">
            <h5 className="text-xs font-semibold text-zinc-900 mb-1">Invite team</h5>
            <p className="text-[10px] text-zinc-500 mb-3 leading-relaxed">
              Collaborate and share your creative workflows.
            </p>
            <button className="w-full py-1.5 bg-white border border-zinc-200 rounded-lg text-xs font-medium text-zinc-700 hover:bg-zinc-50 transition-colors shadow-sm">
              Add members
            </button>
          </div>
          <button className="flex items-center gap-2 text-xs font-medium text-zinc-500 hover:text-zinc-900 transition-colors px-1">
            <Settings className="w-4 h-4" />
            Workspace Settings
          </button>
        </div>
      </aside>

      {/* Main Content */}
      <main className="flex-1 flex flex-col h-full relative overflow-hidden">
        {/* Header */}
        <header className="h-16 border-b border-zinc-100 flex items-center justify-between px-8 bg-white/50 backdrop-blur-md sticky top-0 z-10 flex-shrink-0">
          <div className="flex items-center gap-4 text-sm font-medium text-zinc-500">
            <span className="hover:text-zinc-900 cursor-pointer transition-colors">Home</span>
          </div>

          <div className="flex items-center gap-4">
            <button className="text-xs font-medium text-zinc-500 hover:text-zinc-900 transition-colors">
              Docs
            </button>
            <button className="text-xs font-medium text-zinc-500 hover:text-zinc-900 transition-colors">
              Feedback
            </button>
            <div className="w-px h-4 bg-zinc-200 mx-1"></div>
            <button className="p-2 text-zinc-400 hover:text-zinc-900 transition-colors">
              <Bell className="w-4 h-4" />
            </button>
            <button className="w-8 h-8 rounded-full bg-zinc-100 border border-zinc-200 flex items-center justify-center text-zinc-600 hover:bg-zinc-200 transition-colors">
              <User className="w-4 h-4" />
            </button>
          </div>
        </header>

        <div className="flex-1 overflow-y-auto pb-24">
          <div className="max-w-6xl mx-auto px-8 py-8 space-y-10">
            {/* Promo Banner */}
            <div className="bg-zinc-900 text-white rounded-2xl p-3 flex items-center justify-between shadow-lg shadow-zinc-900/5">
              <div className="flex items-center gap-3 pl-2">
                <span className="px-2 py-0.5 bg-white/20 rounded text-[10px] font-bold uppercase tracking-wide">
                  New
                </span>
                <span className="text-sm font-medium text-zinc-100">
                  Earn credits with every successful referral
                </span>
              </div>
              <button className="px-4 py-1.5 bg-white text-zinc-900 text-xs font-semibold rounded-lg hover:bg-zinc-100 transition-colors">
                Learn more
              </button>
            </div>

            {/* Greeting */}
            <div>
              <p className="text-sm font-medium text-zinc-500 mb-1">My Workspace</p>
              <h1 className="text-3xl font-bold tracking-tight text-zinc-900">
                Good morning, Sam
              </h1>
            </div>

            {/* Action Grid */}
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
              <ActionCard
                icon={Mic}
                label="Instant Speech"
                colorClass="text-blue-600"
                bgColorClass="bg-blue-50"
              />
              <ActionCard
                icon={BookOpen}
                label="Audiobook"
                colorClass="text-emerald-600"
                bgColorClass="bg-emerald-50"
              />
              <ActionCard
                icon={ImageIcon}
                label="Image & Video"
                colorClass="text-purple-600"
                bgColorClass="bg-purple-50"
              />
              <ActionCard
                icon={Bot}
                label="AI Agents"
                colorClass="text-rose-600"
                bgColorClass="bg-rose-50"
              />
              <ActionCard
                icon={Music}
                label="Music"
                colorClass="text-amber-600"
                bgColorClass="bg-amber-50"
              />
              <ActionCard
                icon={Globe}
                label="Dubbing"
                colorClass="text-cyan-600"
                bgColorClass="bg-cyan-50"
              />
            </div>

            {/* Split Content */}
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-12">
              {/* Library */}
              <div className="lg:col-span-7 space-y-6">
                <div className="flex items-center justify-between">
                  <h2 className="text-lg font-bold text-zinc-900">Latest from the library</h2>
                  <button className="text-sm font-medium text-zinc-500 hover:text-zinc-900 transition-colors">
                    View all
                  </button>
                </div>
                <div className="space-y-1">
                  <VoiceListItem
                    avatar="linear-gradient(135deg, #10b981, #047857)"
                    name="Marcus"
                    traits="Deep & Resonant"
                    description="A 40-year-old male voice with a calm, authoritative presence. Perfect for documentaries."
                  />
                  <VoiceListItem
                    avatar="linear-gradient(135deg, #ec4899, #be185d)"
                    name="Elena"
                    traits="Clear & Expressive"
                    description="The voice that transforms everyday words into engaging storytelling."
                  />
                  <VoiceListItem
                    avatar="linear-gradient(135deg, #f59e0b, #b45309)"
                    name="Cahaya"
                    traits="Youthful & Engaging"
                    description="A trendy, upbeat tone ideal for social media narration and modern advertising."
                  />
                  <VoiceListItem
                    avatar="linear-gradient(135deg, #ef4444, #b91c1c)"
                    name="David"
                    traits="Smooth & Professional"
                    description="Polished corporate voice suitable for e-learning and presentations."
                  />
                  <VoiceListItem
                    avatar="linear-gradient(135deg, #6366f1, #4338ca)"
                    name="Nilasari"
                    traits="Natural & Inviting"
                    description="Warm narration with clear articulation and an exceptionally natural cadence."
                  />
                </div>
              </div>

              {/* Creation Tools */}
              <div className="lg:col-span-5 space-y-6">
                <h2 className="text-lg font-bold text-zinc-900">Create or clone</h2>
                <div className="space-y-4">
                  <ToolCard
                    icon={Wand2}
                    title="Voice Design"
                    description="Design an entirely new voice from a text prompt using advanced generative AI."
                    colorClass="text-indigo-600"
                  />
                  <ToolCard
                    icon={Mic2}
                    title="Clone your Voice"
                    description="Create a highly realistic digital clone of your own voice with just a 1-minute sample."
                    colorClass="text-emerald-600"
                  />
                  <ToolCard
                    icon={Library}
                    title="Voice Collections"
                    description="Browse curated AI voices tailored for specific use cases and industries."
                    colorClass="text-blue-600"
                  />
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Floating Player */}
        <div className="absolute bottom-6 left-1/2 -translate-x-1/2 w-full max-w-3xl px-4">
          <div className="bg-zinc-900 text-white rounded-2xl p-4 flex items-center gap-6 shadow-2xl shadow-zinc-900/20 border border-zinc-800">
            <div className="flex-1 min-w-0">
              <div className="flex items-center justify-between mb-2">
                <span className="text-xs font-semibold truncate">Elena — Clear & Expressive</span>
                <span className="text-[10px] text-zinc-400 font-medium">0:00 / 0:12</span>
              </div>
              <div className="h-1 bg-zinc-800 rounded-full overflow-hidden">
                <div className="h-full bg-white w-1/3 rounded-full relative">
                  <div className="absolute right-0 top-1/2 -translate-y-1/2 w-2 h-2 bg-white rounded-full shadow"></div>
                </div>
              </div>
            </div>

            <div className="flex items-center gap-4 shrink-0">
              <button className="text-zinc-400 hover:text-white transition-colors">
                <SkipBack className="w-4 h-4" />
              </button>
              <button
                onClick={() => setIsPlaying(!isPlaying)}
                className="w-10 h-10 rounded-full bg-white text-zinc-900 flex items-center justify-center hover:scale-105 transition-transform"
              >
                {isPlaying ? (
                  <Pause className="w-4 h-4 fill-current" />
                ) : (
                  <Play className="w-4 h-4 fill-current ml-1" />
                )}
              </button>
              <button className="text-zinc-400 hover:text-white transition-colors">
                <SkipForward className="w-4 h-4" />
              </button>
            </div>

            <div className="w-px h-8 bg-zinc-800 mx-2 shrink-0"></div>

            <div className="flex items-center gap-3 shrink-0">
              <button className="text-zinc-400 hover:text-white transition-colors">
                <Volume2 className="w-4 h-4" />
              </button>
              <button className="text-zinc-400 hover:text-white transition-colors">
                <Download className="w-4 h-4" />
              </button>
              <button className="text-zinc-400 hover:text-white transition-colors">
                <MoreHorizontal className="w-4 h-4" />
              </button>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}
