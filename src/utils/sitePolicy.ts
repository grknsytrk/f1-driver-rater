import { supabase } from '../lib/supabaseClient';
import { ensureGuestUser, queueGuestPolicyAcceptance } from './guestSync';

export const SITE_POLICY_VERSION = '2026-10-14';
const LOCAL_ACCEPTANCE_KEY = 'f1_site_policy_accepted_' + SITE_POLICY_VERSION;
const PENDING_ACCEPTANCE_KEY = 'f1_site_policy_pending_' + SITE_POLICY_VERSION;
let activeGuestUserId: string | null = null;

function accountAcceptanceKey(userId: string): string {
    return LOCAL_ACCEPTANCE_KEY + '_' + userId;
}

function readLocalAcceptanceTimestamp(key: string): string | null {
    try {
        const value = localStorage.getItem(key);
        if (!value || value === 'true') return null;
        const time = Date.parse(value);
        return Number.isFinite(time) ? new Date(time).toISOString() : null;
    } catch {
        return null;
    }
}

function readLocalAcceptance(key: string): boolean {
    try {
        const value = localStorage.getItem(key);
        return value === 'true' || readLocalAcceptanceTimestamp(key) !== null;
    } catch {
        return false;
    }
}

function writeLocalAcceptance(key: string, acceptedAt: string): void {
    try {
        localStorage.setItem(key, acceptedAt);
    } catch {
        // The account acceptance is still queued when cloud sync is available.
    }
}

export function hasLocalSitePolicyAcceptance(): boolean {
    if (!supabase) return readLocalAcceptance(LOCAL_ACCEPTANCE_KEY);
    if (activeGuestUserId && readLocalAcceptance(accountAcceptanceKey(activeGuestUserId))) return true;
    return readLocalAcceptance(PENDING_ACCEPTANCE_KEY);
}

export function saveLocalSitePolicyAcceptance(acceptedAt = new Date().toISOString()): void {
    writeLocalAcceptance(
        !supabase
            ? LOCAL_ACCEPTANCE_KEY
            : activeGuestUserId
                ? accountAcceptanceKey(activeGuestUserId)
                : PENDING_ACCEPTANCE_KEY,
        acceptedAt,
    );
}

function clearPendingAcceptance(): void {
    try {
        localStorage.removeItem(PENDING_ACCEPTANCE_KEY);
    } catch {
        // The pending marker is only a local offline fallback.
    }
}

export async function hasCurrentSitePolicyAcceptance(): Promise<boolean> {
    if (!supabase) return readLocalAcceptance(LOCAL_ACCEPTANCE_KEY);

    let userId: string;
    try {
        userId = (await ensureGuestUser()).id;
    } catch (error) {
        if (readLocalAcceptance(PENDING_ACCEPTANCE_KEY)) return true;
        throw error;
    }

    activeGuestUserId = userId;
    if (readLocalAcceptance(accountAcceptanceKey(userId))) return true;
    if (readLocalAcceptance(PENDING_ACCEPTANCE_KEY)) {
        const acceptedAt = readLocalAcceptanceTimestamp(PENDING_ACCEPTANCE_KEY) ?? new Date().toISOString();
        writeLocalAcceptance(accountAcceptanceKey(userId), acceptedAt);
        clearPendingAcceptance();
        queueGuestPolicyAcceptance(SITE_POLICY_VERSION, acceptedAt);
        return true;
    }

    const { data, error } = await supabase
        .from('community_policy_acceptances')
        .select('policy_version, accepted_at')
        .eq('user_id', userId)
        .eq('policy_version', SITE_POLICY_VERSION)
        .maybeSingle();

    if (error) throw error;
    if (!data) return false;

    writeLocalAcceptance(accountAcceptanceKey(userId), data.accepted_at ?? new Date().toISOString());
    return true;
}

export function acceptCurrentSitePolicy(): void {
    const acceptedAt = new Date().toISOString();
    saveLocalSitePolicyAcceptance(acceptedAt);
    queueGuestPolicyAcceptance(SITE_POLICY_VERSION, acceptedAt);
}
