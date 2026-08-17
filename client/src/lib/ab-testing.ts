import { db } from "./firebase";
import { doc, getDoc, setDoc, collection, addDoc, serverTimestamp } from "firebase/firestore";
import * as jStat from "jstat";

export interface ABVariant {
  id: string;
  name: string;
  traffic: number;
}

export interface ABTest {
  id: string;
  name: string;
  status: "draft" | "running" | "paused" | "completed";
  variants: ABVariant[];
  targetAudience: string;
  metric: string;
}

/**
 * Hash function to consistently assign variants based on userId and testId
 */
function hashString(str: string): number {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash; // Convert to 32bit integer
  }
  return Math.abs(hash);
}

/**
 * Assigns a variant to a user for a specific test
 */
export async function assignVariant(userId: string, test: ABTest): Promise<string> {
  if (!userId) return "control";
  
  // 1. Check local cache
  const cached = localStorage.getItem(`ab_assignment_${test.id}`);
  if (cached) return cached;

  // 2. Deterministic assignment
  const hash = hashString(userId + test.id);
  const score = hash % 100;
  
  let cumulativeTraffic = 0;
  let selectedVariant = "control";

  for (const variant of test.variants) {
    cumulativeTraffic += variant.traffic;
    if (score < cumulativeTraffic) {
      selectedVariant = variant.id;
      break;
    }
  }

  // 3. Persist
  localStorage.setItem(`ab_assignment_${test.id}`, selectedVariant);
  
  try {
    const userRef = doc(db, `users/${userId}/ab_assignments`, test.id);
    await setDoc(userRef, {
      variantId: selectedVariant,
      assignedAt: serverTimestamp()
    });

    // 4. Track Assignment Event
    await trackExperimentEvent(test.id, selectedVariant, userId, "variant_assigned");
  } catch (err) {
    console.error("Failed to persist AB assignment", err);
  }

  return selectedVariant;
}

/**
 * Tracks an experiment event
 */
export async function trackExperimentEvent(
  testId: string, 
  variantId: string, 
  userId: string, 
  eventType: string,
  metadata: any = {}
) {
  try {
    await addDoc(collection(db, "ab_events"), {
      testId,
      variantId,
      userId,
      eventType,
      metadata,
      timestamp: serverTimestamp()
    });
  } catch (err) {
    console.error("Failed to track experiment event", err);
  }
}

/**
 * Statistical Significance (p-value) calculation using two-sample t-test
 * For conversion metrics (binomial distribution)
 */
export function calculateSignificance(
  controlUsers: number, 
  controlConversions: number,
  variantUsers: number,
  variantConversions: number
) {
  if (controlUsers === 0 || variantUsers === 0) return { pValue: 1, significant: false };

  const p1 = controlConversions / controlUsers;
  const p2 = variantConversions / variantUsers;
  const pCombined = (controlConversions + variantConversions) / (controlUsers + variantUsers);
  
  const se = Math.sqrt(pCombined * (1 - pCombined) * (1 / controlUsers + 1 / variantUsers));
  if (se === 0) return { pValue: 1, significant: false };

  const zScore = (p2 - p1) / se;
  // @ts-ignore - jStat types might be incomplete
  const pValue = 2 * (1 - jStat.normal.cdf(Math.abs(zScore), 0, 1));

  return {
    pValue,
    significant: pValue < 0.05,
    lift: p1 > 0 ? ((p2 - p1) / p1) * 100 : 0
  };
}
