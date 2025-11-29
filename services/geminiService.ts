
import { GoogleGenAI, Type, Modality } from "@google/genai";
import { AgeGroup, Genre, Story, Scene } from '../types';

const apiKey = process.env.API_KEY;
const ai = new GoogleGenAI({ apiKey: apiKey });

/**
 * Step 1: Generate the story text structure (scenes and image prompts).
 */
export const generateStoryText = async (
  prompt: string,
  ageGroup: AgeGroup,
  genre: Genre,
  heroName: string,
  heroDescription: string
): Promise<Story> => {
  const systemInstruction = `Tu es un conteur expert pour enfants. 
  Tu dois générer une histoire adaptée à l'âge "${ageGroup}" sur le thème "${genre}".
  
  PERSONNAGE PRINCIPAL :
  - Nom : ${heroName}
  - Apparence (description visuelle pour les images) : ${heroDescription}
  
  L'histoire doit être positive, éducative et bienveillante. 
  L'histoire doit être divisée en 4 ou 5 scènes courtes.
  
  IMPORTANT POUR LES IMAGES :
  Dans le champ 'imagePrompt', décris l'ACTION précise de la scène (ex: "is jumping over a log", "is looking at a glowing map"). Ne répète pas toute la description du héros, je l'ajouterai moi-même.
  
  AMBIANCE SONORE :
  Pour chaque scène, choisis une ambiance sonore parmi : 'FOREST' (nature, bois), 'OCEAN' (mer, eau), 'CITY' (ville), 'SPACE' (espace, futur), 'CASTLE' (intérieur, feu de cheminée, calme), 'CALM' (par défaut, calme).
  
  Format de sortie :
  Pour chaque scène, fournis le texte de narration (en français), une description visuelle de l'action (en anglais) et l'ambiance sonore.
  Le texte doit être engageant et facile à lire.`;

  const response = await ai.models.generateContent({
    model: "gemini-2.5-flash",
    contents: `Invente une histoire où le héros s'appelle ${heroName} et basée sur cette idée : "${prompt}".`,
    config: {
      systemInstruction: systemInstruction,
      responseMimeType: "application/json",
      responseSchema: {
        type: Type.OBJECT,
        properties: {
          title: { type: Type.STRING, description: "Le titre de l'histoire en français" },
          scenes: {
            type: Type.ARRAY,
            items: {
              type: Type.OBJECT,
              properties: {
                text: { type: Type.STRING, description: "Le texte de la scène en français" },
                imagePrompt: { type: Type.STRING, description: "Action of the scene in English (e.g., 'finding a treasure chest')." },
                ambientSound: { 
                  type: Type.STRING, 
                  enum: ['FOREST', 'OCEAN', 'CITY', 'SPACE', 'CASTLE', 'CALM'],
                  description: "Background ambient sound type" 
                }
              },
              required: ["text", "imagePrompt", "ambientSound"]
            }
          }
        },
        required: ["title", "scenes"]
      }
    }
  });

  if (!response.text) {
    throw new Error("Aucune histoire générée.");
  }

  return JSON.parse(response.text) as Story;
};

/**
 * Step 2: Generate an illustration for a specific scene.
 * Now enforces character consistency by prepending the hero description.
 */
export const generateSceneImage = async (imagePrompt: string, heroDescription: string): Promise<string> => {
  // Construct a prompt that enforces style and character consistency
  const fullPrompt = `
    Children's book illustration, soft digital painting style, colorful, cute, high quality.
    
    SUBJECT: ${heroDescription}.
    ACTION: ${imagePrompt}.
    
    Ensure the character looks consistent. Use soft lighting and pastel tones.
  `.trim();

  // 1. Try Imagen 4.0 (High Quality)
  try {
    const response = await ai.models.generateImages({
        model: 'imagen-4.0-generate-001',
        prompt: fullPrompt,
        config: {
          numberOfImages: 1,
          aspectRatio: '1:1', 
          outputMimeType: 'image/jpeg'
        },
    });

    const base64Image = response.generatedImages?.[0]?.image?.imageBytes;
    if (base64Image) {
      return `data:image/jpeg;base64,${base64Image}`;
    }
  } catch (e) {
    console.warn("Imagen generation failed, trying fallback model...", e);
  }

  // 2. Fallback: Try Gemini 2.5 Flash Image (General Purpose)
  try {
    const response = await ai.models.generateContent({
      model: 'gemini-2.5-flash-image',
      contents: {
        parts: [{ text: fullPrompt }],
      },
      config: {
          responseModalities: [Modality.IMAGE],
      },
    });

    const part = response.candidates?.[0]?.content?.parts?.[0];
    if (part && part.inlineData && part.inlineData.data) {
       const mimeType = part.inlineData.mimeType || 'image/jpeg';
       return `data:${mimeType};base64,${part.inlineData.data}`;
    }
  } catch (e) {
    console.error("Gemini Flash Image generation failed", e);
  }

  // 3. Last Resort: Placeholder
  console.warn("All image generation failed, using placeholder.");
  // Using a seed ensures the image is constant for a given prompt
  return `https://picsum.photos/1024/1024?seed=${encodeURIComponent(imagePrompt)}`;
};

/**
 * Step 3: Generate narration audio for a specific scene.
 */
export const generateSceneAudio = async (text: string, ageGroup: AgeGroup): Promise<string> => {
  // Select voice based on age group
  let voiceName = 'Kore'; 
  if (ageGroup === AgeGroup.TODDLER || ageGroup === AgeGroup.KIDS) {
    voiceName = 'Zephyr'; // Friendly, higher pitch
  } else if (ageGroup === AgeGroup.PRETEEN) {
    voiceName = 'Puck'; // Storyteller vibe
  }

  try {
    const response = await ai.models.generateContent({
      model: "gemini-2.5-flash-preview-tts",
      contents: {
        parts: [{ text: text }],
      },
      config: {
        responseModalities: [Modality.AUDIO],
        speechConfig: {
          voiceConfig: {
            prebuiltVoiceConfig: { voiceName: voiceName },
          },
        },
      },
    });

    const base64Audio = response.candidates?.[0]?.content?.parts?.[0]?.inlineData?.data;
    
    if (!base64Audio) {
        throw new Error("No audio generated");
    }

    const binaryString = atob(base64Audio);
    const len = binaryString.length;
    const bytes = new Uint8Array(len);
    for (let i = 0; i < len; i++) {
      bytes[i] = binaryString.charCodeAt(i);
    }
    
    const wavBytes = addWavHeader(bytes, 24000, 1); 
    const wavBlob = new Blob([wavBytes], { type: 'audio/wav' });
    return URL.createObjectURL(wavBlob);

  } catch (error) {
    console.error("TTS generation failed", error);
    return "";
  }
};

/**
 * Helper to add a WAV header to raw PCM data.
 */
function addWavHeader(samples: Uint8Array, sampleRate: number, numChannels: number): ArrayBuffer {
    const buffer = new ArrayBuffer(44 + samples.length);
    const view = new DataView(buffer);

    writeString(view, 0, 'RIFF');
    view.setUint32(4, 36 + samples.length, true);
    writeString(view, 8, 'WAVE');
    writeString(view, 12, 'fmt ');
    view.setUint32(16, 16, true);
    view.setUint16(20, 1, true);
    view.setUint16(22, numChannels, true);
    view.setUint32(24, sampleRate, true);
    view.setUint32(28, sampleRate * numChannels * 2, true);
    view.setUint16(32, numChannels * 2, true);
    view.setUint16(34, 16, true);
    writeString(view, 36, 'data');
    view.setUint32(40, samples.length, true);

    const pcmData = new Uint8Array(buffer, 44);
    pcmData.set(samples);

    return buffer;
}

function writeString(view: DataView, offset: number, string: string) {
    for (let i = 0; i < string.length; i++) {
        view.setUint8(offset + i, string.charCodeAt(i));
    }
}
