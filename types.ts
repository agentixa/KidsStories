
export enum AgeGroup {
  TODDLER = '3-4 ans',
  KIDS = '5-7 ans',
  PRETEEN = '8-10 ans',
  TEEN = '11-13 ans'
}

export enum Genre {
  ADVENTURE = 'Aventure',
  FRIENDSHIP = 'Amitié',
  ANIMALS = 'Animaux',
  ROBOTS = 'Robots & Science',
  FAIRYTALE = 'Contes & Princesses',
  MYSTERY = 'Mystère',
  LEARNING = 'Apprentissage'
}

export type AmbientSound = 'FOREST' | 'OCEAN' | 'CITY' | 'SPACE' | 'CASTLE' | 'CALM';

export interface HeroArchetype {
  id: string;
  label: string;
  icon: string; // Emoji
  promptDescription: string; // English description for image generation
}

export interface Scene {
  text: string;
  imagePrompt: string;
  ambientSound?: AmbientSound;
  imageUrl?: string; // Base64 or Blob URL
  audioUrl?: string; // Blob URL
}

export interface Story {
  title: string;
  scenes: Scene[];
}

export interface UserPreferences {
  prompt: string;
  ageGroup: AgeGroup;
  genre: Genre;
  darkMode: boolean;
}
