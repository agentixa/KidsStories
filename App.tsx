import React, { useState, useRef, useEffect } from 'react';
import { AgeGroup, Genre, Story, Scene, HeroArchetype, AmbientSound } from './types.ts';
import { generateStoryText, generateSceneImage, generateSceneAudio } from './services/geminiService.ts';
import { 
  BookOpenIcon, 
  SparklesIcon, 
  MusicalNoteIcon, 
  SpeakerXMarkIcon, 
  SpeakerWaveIcon, 
  ArrowRightIcon, 
  ArrowLeftIcon, 
  SunIcon, 
  MoonIcon, 
  ArrowPathIcon, 
  UserIcon,
  ExclamationCircleIcon
} from '@heroicons/react/24/solid';

// --- Constants ---

const HERO_ARCHETYPES: HeroArchetype[] = [
  { id: 'knight', label: 'Chevalier', icon: '🛡️', promptDescription: 'cute little knight in shining silver armor, cape' },
  { id: 'explorer', label: 'Explorateur', icon: '🧭', promptDescription: 'curious young explorer child with a safari hat and backpack' },
  { id: 'animal', label: 'Animal', icon: '🦊', promptDescription: 'friendly cute anthropomorphic fox wearing a small scarf' },
  { id: 'superhero', label: 'Super-héros', icon: '⚡', promptDescription: 'brave little superhero child with a mask and cape' },
  { id: 'wizard', label: 'Sorcier', icon: '✨', promptDescription: 'little wizard child with a pointy hat and a magic wand' },
  { id: 'robot', label: 'Robot', icon: '🤖', promptDescription: 'cute friendly round robot with glowing blue eyes' },
];

const AMBIENT_SOUNDS_URLS: Record<AmbientSound, string> = {
  FOREST: 'https://actions.google.com/sounds/v1/nature/forest_wind.ogg',
  OCEAN: 'https://actions.google.com/sounds/v1/nature/ocean_waves.ogg',
  CITY: 'https://actions.google.com/sounds/v1/ambiences/city_traffic.ogg',
  SPACE: 'https://actions.google.com/sounds/v1/weather/wind_synthetic.ogg',
  CASTLE: 'https://actions.google.com/sounds/v1/ambiences/warm_camp_fire.ogg', // Fire crackling for cozy/castle vibe
  CALM: 'https://actions.google.com/sounds/v1/nature/meadow_birds.ogg'
};

// --- Components for Internal Structure ---

interface SelectionCardProps {
  selected: boolean;
  onClick: () => void;
  label: string;
  icon?: React.ReactNode;
}

const SelectionCard: React.FC<SelectionCardProps> = ({ 
  selected, 
  onClick, 
  label, 
  icon 
}) => (
  <button
    onClick={onClick}
    className={`
      p-3 md:p-4 rounded-2xl border-4 transition-all duration-200 flex flex-col items-center justify-center gap-2
      ${selected 
        ? 'border-magic-primary bg-purple-100 text-magic-primary scale-105 shadow-lg ring-2 ring-purple-300' 
        : 'border-gray-200 bg-white hover:border-purple-200 hover:bg-purple-50 text-gray-600'
      }
    `}
  >
    {icon && <div className="text-3xl">{icon}</div>}
    <span className="font-bold text-sm md:text-base whitespace-nowrap">{label}</span>
  </button>
);

const LoadingScreen = ({ message }: { message: string }) => (
  <div className="flex flex-col items-center justify-center min-h-[50vh] text-center space-y-8 animate-fade-in">
    <div className="relative w-32 h-32">
      <div className="absolute inset-0 border-8 border-purple-200 rounded-full opacity-20"></div>
      <div className="absolute inset-0 border-8 border-t-magic-primary border-r-magic-secondary rounded-full animate-spin"></div>
      <div className="absolute inset-0 flex items-center justify-center">
        <SparklesIcon className="w-12 h-12 text-magic-accent animate-pulse" />
      </div>
    </div>
    <h2 className="text-2xl md:text-3xl font-bold text-magic-primary animate-bounce-slow">
      {message}
    </h2>
    <p className="text-gray-500 max-w-md">L'intelligence artificielle invente ton histoire...</p>
  </div>
);

const ImageLoader = () => (
  <div className="absolute inset-0 flex flex-col items-center justify-center bg-gray-50/90 backdrop-blur-md z-20 transition-all duration-300 rounded-3xl border border-white/50">
    <div className="relative w-20 h-20 mb-4">
      <div className="absolute inset-0 border-4 border-purple-100 rounded-full"></div>
      <div className="absolute inset-0 border-4 border-t-magic-primary border-r-transparent border-b-transparent border-l-transparent rounded-full animate-spin"></div>
      <SparklesIcon className="absolute inset-0 w-10 h-10 m-auto text-magic-accent animate-pulse" />
    </div>
    <span className="text-base font-bold text-magic-primary animate-pulse tracking-wide">
      Création de l'image...
    </span>
  </div>
);

const ImageError = () => (
  <div className="absolute inset-0 flex flex-col items-center justify-center bg-gray-100 z-10 text-gray-400 p-4 text-center rounded-3xl">
    <ExclamationCircleIcon className="w-16 h-16 mb-2 text-gray-300" />
    <p className="text-sm font-medium">Image indisponible</p>
  </div>
);

// --- Main App ---

const App: React.FC = () => {
  // State: Flow
  const [step, setStep] = useState<number>(0); // 0: Input, 1: Loading Text, 3: Reading
  
  // State: User Input
  const [prompt, setPrompt] = useState('');
  const [selectedAge, setSelectedAge] = useState<AgeGroup>(AgeGroup.KIDS);
  const [selectedGenre, setSelectedGenre] = useState<Genre>(Genre.ADVENTURE);
  
  // State: Character
  const [heroName, setHeroName] = useState('');
  const [selectedArchetypeId, setSelectedArchetypeId] = useState<string>(HERO_ARCHETYPES[0].id);
  
  // State: Story Data
  const [story, setStory] = useState<Story | null>(null);
  const [currentSceneIndex, setCurrentSceneIndex] = useState(0);
  
  // State: View
  const [isImageVisualReady, setIsImageVisualReady] = useState(false); // Browser finished loading image
  const [imageError, setImageError] = useState(false);

  // State: Preferences
  const [isDarkMode, setIsDarkMode] = useState(false);
  const [isAudioEnabled, setIsAudioEnabled] = useState(true); // Narrator
  const [isAmbienceEnabled, setIsAmbienceEnabled] = useState(true); // Background sounds
  const [loadingStatus, setLoadingStatus] = useState('');

  // Refs
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const ambientRef = useRef<HTMLAudioElement | null>(null);

  // Effect: Check Audio Support (Specifically OGG for Ambience)
  useEffect(() => {
    const testAudio = new Audio();
    // Check if browser can play OGG (Safari often cannot)
    const canPlayOgg = testAudio.canPlayType('audio/ogg; codecs="vorbis"');
    if (canPlayOgg === '') {
       console.log("OGG audio format not supported by this browser. Disabling ambient sounds.");
       setIsAmbienceEnabled(false);
    }
  }, []);

  // Effect: Dark Mode
  useEffect(() => {
    if (isDarkMode) {
      document.documentElement.classList.add('dark');
      document.body.classList.add('bg-dark-bg');
      document.body.classList.remove('bg-blue-50');
    } else {
      document.documentElement.classList.remove('dark');
      document.body.classList.remove('bg-dark-bg');
      document.body.classList.add('bg-blue-50');
    }
  }, [isDarkMode]);

  // Effect: Reset visual loading state when scene changes or image URL updates
  useEffect(() => {
    setIsImageVisualReady(false);
    setImageError(false);
  }, [currentSceneIndex, story?.scenes[currentSceneIndex]?.imageUrl]);

  // Effect: Audio Player Logic
  useEffect(() => {
    if (step === 3 && story) {
      const currentScene = story.scenes[currentSceneIndex];

      // --- 1. Handle Narration ---
      if (audioRef.current && currentScene?.audioUrl) {
         // If source changed, load new
         if (audioRef.current.src !== currentScene.audioUrl) {
            audioRef.current.pause();
            audioRef.current.src = currentScene.audioUrl;
            audioRef.current.load();
            
            if (isAudioEnabled) {
               audioRef.current.play().catch(error => console.log("Narration auto-play prevented:", error));
            }
         } else {
            // Source is same (e.g. background image loaded, or audio toggle)
            if (isAudioEnabled) {
               // Only resume if it was paused and hasn't ended naturally
               if (audioRef.current.paused && !audioRef.current.ended) {
                   audioRef.current.play().catch(() => {});
               }
            } else {
               audioRef.current.pause();
            }
         }
      } else if (audioRef.current) {
         // No audio for this scene (or yet to generate)
         audioRef.current.pause();
      }

      // --- 2. Handle Ambient Sound ---
      if (ambientRef.current && isAmbienceEnabled) {
        const ambientType = currentScene?.ambientSound || 'CALM';
        const nextAmbientUrl = AMBIENT_SOUNDS_URLS[ambientType];
        
        if (!ambientRef.current.src.endsWith(nextAmbientUrl.split('/').pop() || '')) {
           ambientRef.current.src = nextAmbientUrl;
           ambientRef.current.load();
        }

        ambientRef.current.volume = 0.3; 
        if (ambientRef.current.paused) {
           ambientRef.current.play().catch(error => console.log("Ambient play prevented:", error));
        }
      } else if (ambientRef.current) {
        ambientRef.current.pause();
      }
    }
  }, [currentSceneIndex, step, story, isAudioEnabled, isAmbienceEnabled]);

  const handleStart = async () => {
    if (!prompt.trim() || !heroName.trim()) return;
    
    setStep(1);
    setLoadingStatus('Écriture de l\'histoire...');

    try {
      const archetype = HERO_ARCHETYPES.find(a => a.id === selectedArchetypeId) || HERO_ARCHETYPES[0];

      // 1. Generate Text Structure (Blocking)
      const generatedStory = await generateStoryText(
        prompt, 
        selectedAge, 
        selectedGenre,
        heroName,
        archetype.promptDescription
      );
      
      // Initialize story with empty assets
      const initialScenes = generatedStory.scenes.map(s => ({ ...s, imageUrl: undefined, audioUrl: undefined }));
      setStory({ ...generatedStory, scenes: initialScenes });
      
      // Move to Reading View Immediately
      setStep(3);
      setCurrentSceneIndex(0);

      // 2. Trigger Background Asset Generation (Non-blocking)
      generatedStory.scenes.forEach(async (scene, index) => {
          // Generate Image
          try {
             const imgUrl = await generateSceneImage(scene.imagePrompt, archetype.promptDescription);
             setStory(prev => {
                if (!prev) return null;
                const newScenes = [...prev.scenes];
                // Check if changed to avoid unnecessary re-renders
                if (newScenes[index].imageUrl !== imgUrl) {
                  newScenes[index] = { ...newScenes[index], imageUrl: imgUrl };
                  return { ...prev, scenes: newScenes };
                }
                return prev;
             });
          } catch (e) { console.error("Image generation failed for scene", index, e); }

          // Generate Audio
          try {
             const audioUrl = await generateSceneAudio(scene.text, selectedAge);
             setStory(prev => {
                if (!prev) return null;
                const newScenes = [...prev.scenes];
                if (newScenes[index].audioUrl !== audioUrl) {
                  newScenes[index] = { ...newScenes[index], audioUrl: audioUrl };
                  return { ...prev, scenes: newScenes };
                }
                return prev;
             });
          } catch (e) { console.error("Audio generation failed for scene", index, e); }
      });

    } catch (error) {
      console.error("Error generating story:", error);
      setStep(0);
      alert("Oups ! Une erreur est survenue lors de la création magique. Réessaie !");
    }
  };

  const handleReset = () => {
    setStep(0);
    setPrompt('');
    setStory(null);
    setCurrentSceneIndex(0);
  };

  // --- Views ---

  const renderInputView = () => (
    <div className="max-w-4xl mx-auto p-4 md:p-6">
      <header className="text-center mb-6 md:mb-10 space-y-3">
        <div className="inline-block p-3 bg-white dark:bg-gray-800 rounded-full shadow-lg mb-2">
          <BookOpenIcon className="w-10 h-10 md:w-12 md:h-12 text-magic-primary" />
        </div>
        <h1 className="text-3xl md:text-5xl font-extrabold text-magic-primary tracking-tight">
          Raconte-moi une histoire
        </h1>
        <p className="text-lg md:text-xl text-gray-600 dark:text-gray-300">
          Crée ton propre dessin animé magique !
        </p>
      </header>

      <div className="bg-white/80 dark:bg-gray-800/90 backdrop-blur-sm rounded-[2rem] p-6 md:p-10 shadow-xl border-2 border-white/50 dark:border-gray-700 space-y-10">
        
        {/* Section 1: The Hero */}
        <section className="space-y-6">
          <div className="flex items-center gap-3 pb-2 border-b border-gray-200 dark:border-gray-700">
             <div className="bg-magic-secondary/20 p-2 rounded-lg">
                <UserIcon className="w-6 h-6 text-magic-secondary" />
             </div>
             <h3 className="text-xl md:text-2xl font-bold text-gray-800 dark:text-white">1. Ton Héros</h3>
          </div>

          <div className="grid md:grid-cols-2 gap-6">
            <div className="space-y-3">
              <label className="block text-sm font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                Comment s'appelle-t-il ?
              </label>
              <input
                type="text"
                value={heroName}
                onChange={(e) => setHeroName(e.target.value)}
                placeholder="Ex: Arthur, Léa, Pilou..."
                className="w-full p-4 text-lg rounded-xl border-2 border-purple-100 focus:border-magic-secondary focus:ring-4 focus:ring-pink-100 outline-none transition-all dark:bg-gray-700 dark:border-gray-600 dark:text-white"
              />
            </div>
            
            <div className="space-y-3">
              <label className="block text-sm font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                À quoi ressemble-t-il ?
              </label>
              <div className="grid grid-cols-3 gap-2">
                {HERO_ARCHETYPES.map((archetype) => (
                  <button
                    key={archetype.id}
                    onClick={() => setSelectedArchetypeId(archetype.id)}
                    className={`
                      p-2 rounded-xl border-2 transition-all flex flex-col items-center justify-center gap-1
                      ${selectedArchetypeId === archetype.id 
                        ? 'border-magic-secondary bg-pink-50 text-magic-secondary scale-105' 
                        : 'border-gray-200 bg-white text-gray-400 hover:border-pink-200'
                      }
                    `}
                  >
                    <span className="text-2xl">{archetype.icon}</span>
                    <span className="text-xs font-bold truncate w-full text-center">{archetype.label}</span>
                  </button>
                ))}
              </div>
            </div>
          </div>
        </section>

        {/* Section 2: The Story */}
        <section className="space-y-6">
           <div className="flex items-center gap-3 pb-2 border-b border-gray-200 dark:border-gray-700">
             <div className="bg-magic-primary/20 p-2 rounded-lg">
                <SparklesIcon className="w-6 h-6 text-magic-primary" />
             </div>
             <h3 className="text-xl md:text-2xl font-bold text-gray-800 dark:text-white">2. Ton Histoire</h3>
          </div>

          <div className="space-y-4">
            <label className="block text-lg font-bold text-gray-700 dark:text-gray-200">
               Que va-t-il se passer ?
            </label>
            <input
              type="text"
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              placeholder="Ex: Il trouve une carte au trésor dans le jardin..."
              className="w-full p-5 text-xl rounded-2xl border-2 border-purple-100 focus:border-magic-primary focus:ring-4 focus:ring-purple-100 outline-none transition-all dark:bg-gray-700 dark:border-gray-600 dark:text-white"
            />
          </div>

          <div className="grid md:grid-cols-2 gap-8">
            <div className="space-y-3">
              <label className="block text-sm font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wider">Pour quel âge ?</label>
              <div className="grid grid-cols-2 gap-2">
                {Object.values(AgeGroup).map((age) => (
                  <SelectionCard
                    key={age}
                    selected={selectedAge === age}
                    onClick={() => setSelectedAge(age)}
                    label={age}
                  />
                ))}
              </div>
            </div>

            <div className="space-y-3">
              <label className="block text-sm font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wider">Quel genre ?</label>
              <div className="grid grid-cols-2 gap-2 h-48 overflow-y-auto pr-2 scrollbar-thin">
                {Object.values(Genre).map((genre) => (
                  <SelectionCard
                    key={genre}
                    selected={selectedGenre === genre}
                    onClick={() => setSelectedGenre(genre)}
                    label={genre}
                  />
                ))}
              </div>
            </div>
          </div>
        </section>

        {/* Action Button */}
        <div className="pt-4 flex justify-center">
          <button
            onClick={handleStart}
            disabled={!prompt.trim() || !heroName.trim()}
            className="bg-gradient-to-r from-magic-primary to-magic-secondary hover:from-purple-600 hover:to-pink-600 text-white text-xl md:text-2xl font-bold py-4 px-12 rounded-full shadow-lg transform transition hover:scale-105 disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-3 w-full md:w-auto justify-center"
          >
            <SparklesIcon className="w-8 h-8 animate-pulse" />
            Créer l'histoire !
          </button>
        </div>
      </div>
    </div>
  );

  const renderStoryView = () => {
    if (!story) return null;
    const scene = story.scenes[currentSceneIndex];
    const isLastScene = currentSceneIndex === story.scenes.length - 1;

    return (
      <div className="max-w-6xl mx-auto h-[calc(100vh-2rem)] md:h-screen flex flex-col md:justify-center p-4 pb-20 md:pb-4">
        {/* Navigation Header */}
        <div className="flex justify-between items-center mb-4 bg-white/90 dark:bg-gray-800/90 p-4 rounded-2xl shadow-sm backdrop-blur">
          <button onClick={handleReset} className="text-sm font-bold text-gray-500 hover:text-magic-primary flex items-center gap-2">
            <ArrowLeftIcon className="w-4 h-4" /> Accueil
          </button>
          <h2 className="text-lg md:text-xl font-bold text-magic-primary truncate px-4">{story.title}</h2>
          <div className="flex gap-2">
             {/* Narration Toggle */}
             <button 
                onClick={() => setIsAudioEnabled(!isAudioEnabled)}
                className={`p-2 rounded-full ${isAudioEnabled ? 'bg-purple-100 text-magic-primary' : 'bg-gray-200 text-gray-500'} dark:bg-gray-700`}
                title="Narration"
             >
                {isAudioEnabled ? <SpeakerWaveIcon className="w-6 h-6" /> : <SpeakerXMarkIcon className="w-6 h-6" />}
             </button>

             {/* Ambience Toggle */}
             <button 
                onClick={() => setIsAmbienceEnabled(!isAmbienceEnabled)}
                className={`p-2 rounded-full ${isAmbienceEnabled ? 'bg-green-100 text-green-600' : 'bg-gray-200 text-gray-500'} dark:bg-gray-700`}
                title="Ambiance sonore"
             >
                {isAmbienceEnabled ? <MusicalNoteIcon className="w-6 h-6" /> : <div className="relative"><MusicalNoteIcon className="w-6 h-6" /><div className="absolute inset-0 border-b-2 border-gray-500 transform -rotate-45 top-1/2"></div></div>}
             </button>
          </div>
        </div>

        {/* Main Content Card */}
        <div className="flex-1 bg-white dark:bg-gray-800 rounded-3xl shadow-2xl overflow-hidden flex flex-col md:flex-row relative border-4 border-white dark:border-gray-700">
          
          {/* Image Section (Left/Top) */}
          <div className="md:w-1/2 bg-gray-100 relative flex items-center justify-center overflow-hidden min-h-[300px]">
            {/* Show loader if image isn't ready and no error occurred */}
            {(!scene.imageUrl || !isImageVisualReady) && !imageError && <ImageLoader />}
            
            {/* Show error if image failed to load */}
            {imageError && <ImageError />}

            {scene.imageUrl && (
               <img 
                 src={scene.imageUrl} 
                 alt="Scene illustration" 
                 className={`w-full h-full object-cover transition-opacity duration-500 ${isImageVisualReady ? 'opacity-100' : 'opacity-0'}`}
                 onLoad={() => setIsImageVisualReady(true)}
                 onError={() => setImageError(true)}
               />
            )}
          </div>

          {/* Text Section (Right/Bottom) */}
          <div className="md:w-1/2 p-6 md:p-10 flex flex-col justify-center relative bg-white dark:bg-gray-800">
            <div className="flex-1 flex items-center">
              <p className="text-xl md:text-2xl lg:text-3xl leading-relaxed font-medium text-gray-800 dark:text-gray-100 font-sans">
                {scene.text}
              </p>
            </div>
            
            {/* Audio Elements (Hidden but functional) */}
            <audio 
                ref={audioRef} 
                onEnded={() => !isLastScene && setCurrentSceneIndex(i => i + 1)} 
                onError={() => console.log("Narration playback error or empty source")}
            />
            <audio 
                ref={ambientRef} 
                loop 
                onError={() => {
                    if (ambientRef.current) ambientRef.current.pause();
                }} 
            />

            {/* Navigation Controls */}
            <div className="mt-8 flex justify-between items-center">
              <button 
                onClick={() => setCurrentSceneIndex(Math.max(0, currentSceneIndex - 1))}
                disabled={currentSceneIndex === 0}
                className="p-3 rounded-full hover:bg-gray-100 dark:hover:bg-gray-700 disabled:opacity-0 transition-all"
              >
                <ArrowLeftIcon className="w-8 h-8 text-magic-primary" />
              </button>

              <span className="text-sm font-bold text-gray-400">
                {currentSceneIndex + 1} / {story.scenes.length}
              </span>

              <button 
                onClick={() => {
                  if (isLastScene) {
                    handleReset();
                  } else {
                    setCurrentSceneIndex(currentSceneIndex + 1);
                  }
                }}
                className={`
                  flex items-center gap-2 py-3 px-6 rounded-full font-bold text-white shadow-lg transform transition hover:scale-105
                  ${isLastScene ? 'bg-green-500 hover:bg-green-600' : 'bg-magic-primary hover:bg-purple-700'}
                `}
              >
                {isLastScene ? (
                  <>Recommencer <ArrowPathIcon className="w-5 h-5" /></>
                ) : (
                  <>Suivant <ArrowRightIcon className="w-5 h-5" /></>
                )}
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  };

  return (
    <div className="min-h-screen transition-colors duration-500 font-sans">
      {/* Global Theme Toggle (Floating) */}
      <button
        onClick={() => setIsDarkMode(!isDarkMode)}
        className="fixed top-4 right-4 z-50 p-3 rounded-full bg-white/80 dark:bg-gray-800/80 backdrop-blur shadow-md text-gray-600 dark:text-yellow-400 hover:shadow-lg transition-all"
      >
        {isDarkMode ? <SunIcon className="w-6 h-6" /> : <MoonIcon className="w-6 h-6" />}
      </button>

      {step === 0 && renderInputView()}
      
      {step === 1 && (
        <LoadingScreen 
          message={loadingStatus} 
        />
      )}

      {step === 3 && renderStoryView()}
    </div>
  );
};

export default App;