/**
 * Geolocation utility for silent coordinate capture.
 *
 * Used by the Publishing Engine (post creation) and the Ledger (feed mount)
 * to geo-tag content and enable 200-mile proximity filtering.
 *
 * Privacy: Coordinates are stored in Firestore on the user's profile
 * and on posts; they are NEVER exposed in API responses to other users.
 */

import { doc, updateDoc } from "firebase/firestore";
import { db } from "@/lib/firebase/config";

export interface GeoCoordinates {
    lat: number;
    lng: number;
}

// Module-level cache to avoid repeated browser prompts per session
let cachedCoords: GeoCoordinates | null = null;
let permissionDenied = false;

/**
 * Silently request the user's current position via the browser Geolocation API.
 * Returns cached coordinates if already captured this session.
 * Returns null if permissions are denied or the API is unavailable.
 */
export function getUserLocation(): Promise<GeoCoordinates | null> {
    // Return cached result immediately
    if (cachedCoords) return Promise.resolve(cachedCoords);
    if (permissionDenied) return Promise.resolve(null);

    // Guard: no Geolocation API available
    if (typeof navigator === "undefined" || !navigator.geolocation) {
        return Promise.resolve(null);
    }

    return new Promise((resolve) => {
        navigator.geolocation.getCurrentPosition(
            (position) => {
                cachedCoords = {
                    lat: position.coords.latitude,
                    lng: position.coords.longitude,
                };
                resolve(cachedCoords);
            },
            () => {
                // User denied or error — mark and return null
                permissionDenied = true;
                resolve(null);
            },
            {
                enableHighAccuracy: false, // coarse is fine for 200-mile radius
                timeout: 8000,
                maximumAge: 5 * 60 * 1000, // accept cached position up to 5 min old
            }
        );
    });
}

/**
 * Persist coordinates to the user's Firestore profile.
 * Called once when location is first captured so the feed API
 * can use them for server-side proximity filtering.
 */
export async function storeUserLocation(uid: string, coords: GeoCoordinates): Promise<void> {
    try {
        await updateDoc(doc(db, "users", uid), {
            home_lat: coords.lat,
            home_lng: coords.lng,
        });
    } catch (e) {
        console.error("Failed to store user location:", e);
    }
}

/**
 * Reset cached state (useful if user later grants permissions).
 */
export function resetLocationCache(): void {
    cachedCoords = null;
    permissionDenied = false;
}
