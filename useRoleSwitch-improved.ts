'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { useSession } from 'next-auth/react';
import { useRouter } from 'next/navigation';

interface UserRole {
    role: 'admin' | 'influencer' | 'business' | 'user';
    isActive: boolean;
    approvedAt?: Date;
    applicationId?: string;
}

interface RoleSwitchError {
    message: string;
    code?: string;
    action?: string;
    applicationUrl?: string;
    retryable?: boolean;
}

interface UseRoleSwitchReturn {
    currentRole: string;
    userRoles: UserRole[];
    loading: boolean;
    switching: boolean;
    error: RoleSwitchError | null;
    switchRole: (newRole: string) => Promise<void>;
    refreshRoles: () => Promise<void>;
    clearError: () => void;
    retryLastAction: () => Promise<void>;
}

// Constants
const ROLE_SWITCH_COOLDOWN = 2000; // Reduced from 5000ms
const MAX_RETRY_ATTEMPTS = 3;
const RETRY_DELAY_BASE = 1000;

export function useRoleSwitch(): UseRoleSwitchReturn {
    const { data: session, update } = useSession();
    const router = useRouter();

    // State
    const [currentRole, setCurrentRole] = useState<string>('user');
    const [userRoles, setUserRoles] = useState<UserRole[]>([]);
    const [loading, setLoading] = useState(false);
    const [switching, setSwitching] = useState(false);
    const [error, setError] = useState<RoleSwitchError | null>(null);

    // Refs for cleanup and race condition prevention
    const abortControllerRef = useRef<AbortController | null>(null);
    const lastActionRef = useRef<(() => Promise<void>) | null>(null);
    const switchTimeoutRef = useRef<NodeJS.Timeout | null>(null);

    // Cleanup function
    const cleanup = useCallback(() => {
        if (abortControllerRef.current) {
            abortControllerRef.current.abort();
            abortControllerRef.current = null;
        }
        if (switchTimeoutRef.current) {
            clearTimeout(switchTimeoutRef.current);
            switchTimeoutRef.current = null;
        }
    }, []);

    // Enhanced error handling with retry logic
    const handleApiError = useCallback((err: unknown, context: string): RoleSwitchError => {
        console.error(`${context} error:`, err);
        
        if (err instanceof Error) {
            if (err.name === 'AbortError') {
                return { message: 'Request was cancelled', retryable: false };
            }
            if (err.message.includes('NetworkError') || err.message.includes('fetch')) {
                return { 
                    message: 'Network error. Please check your connection.', 
                    retryable: true 
                };
            }
        }
        
        return { 
            message: `${context} failed. Please try again.`, 
            retryable: true 
        };
    }, []);

    // Enhanced fetch with retry logic
    const fetchWithRetry = useCallback(async (
        url: string, 
        options: RequestInit = {}, 
        maxRetries = MAX_RETRY_ATTEMPTS
    ): Promise<Response> => {
        let lastError: Error;
        
        for (let attempt = 0; attempt <= maxRetries; attempt++) {
            try {
                // Create new abort controller for this request
                const controller = new AbortController();
                abortControllerRef.current = controller;

                const response = await fetch(url, {
                    ...options,
                    signal: controller.signal,
                });

                return response;
            } catch (err) {
                lastError = err instanceof Error ? err : new Error('Unknown error');
                
                // Don't retry if aborted or on last attempt
                if (lastError.name === 'AbortError' || attempt === maxRetries) {
                    throw lastError;
                }

                // Exponential backoff
                const delay = RETRY_DELAY_BASE * Math.pow(2, attempt);
                await new Promise(resolve => setTimeout(resolve, delay));
            }
        }
        
        throw lastError!;
    }, []);

    // Fetch user roles with improved error handling
    const fetchUserRoles = useCallback(async () => {
        if (!session?.user?.email) {
            setUserRoles([]);
            setCurrentRole('user');
            return;
        }

        setLoading(true);
        setError(null);

        try {
            const response = await fetchWithRetry('/api/user/role-check');

            if (response.ok) {
                const data = await response.json();
                setUserRoles(data.allRoles || []);
                
                // Only update currentRole if it's different to prevent unnecessary re-renders
                if (data.actualRole && data.actualRole !== currentRole) {
                    setCurrentRole(data.actualRole);
                }
            } else {
                const errorData = await response.json();
                setError({
                    message: errorData.message || 'Failed to fetch user roles',
                    code: errorData.code,
                    retryable: response.status >= 500 || response.status === 429
                });
            }
        } catch (err) {
            setError(handleApiError(err, 'Fetch user roles'));
        } finally {
            setLoading(false);
        }
    }, [session?.user?.email, currentRole, fetchWithRetry, handleApiError]);

    // Enhanced role switching with better UX
    const switchRole = useCallback(async (newRole: string) => {
        if (!session?.user?.email || switching || newRole === currentRole) {
            return;
        }

        // Check cooldown
        const lastSwitchTime = localStorage.getItem('lastRoleSwitchTime');
        const now = Date.now();
        if (lastSwitchTime && (now - parseInt(lastSwitchTime)) < ROLE_SWITCH_COOLDOWN) {
            setError({
                message: 'Please wait before switching roles again.',
                retryable: false
            });
            return;
        }

        setSwitching(true);
        setError(null);

        try {
            localStorage.setItem('lastRoleSwitchTime', now.toString());

            const response = await fetchWithRetry('/api/user/switch-role', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({ role: newRole }),
            });

            const responseData = await response.json();

            if (response.ok) {
                // Update local state optimistically
                setCurrentRole(newRole);

                // Update session without forcing a page reload
                try {
                    await update({ currentRole: newRole, role: newRole });
                } catch (updateError) {
                    console.warn('Session update failed, but role was switched:', updateError);
                }

                // Refresh roles to get updated data
                await refreshRoles();

                // Clear any previous errors
                setError(null);
            } else {
                // Handle specific error cases
                if (responseData.code === 'ROLE_NOT_AVAILABLE' && responseData.action === 'apply') {
                    router.push(responseData.applicationUrl);
                    return;
                }

                setError({
                    message: responseData.message || 'Failed to switch role',
                    code: responseData.code,
                    action: responseData.action,
                    applicationUrl: responseData.applicationUrl,
                    retryable: response.status >= 500 || response.status === 429
                });
            }
        } catch (err) {
            setError(handleApiError(err, 'Role switch'));
        } finally {
            setSwitching(false);
        }
    }, [
        session?.user?.email, 
        switching, 
        currentRole, 
        fetchWithRetry, 
        handleApiError, 
        update, 
        router
    ]);

    // Store last action for retry functionality
    const refreshRoles = useCallback(async () => {
        lastActionRef.current = fetchUserRoles;
        await fetchUserRoles();
    }, [fetchUserRoles]);

    // Retry last failed action
    const retryLastAction = useCallback(async () => {
        if (lastActionRef.current) {
            await lastActionRef.current();
        }
    }, []);

    // Clear error state
    const clearError = useCallback(() => {
        setError(null);
    }, []);

    // Initialize roles when session changes
    useEffect(() => {
        if (session?.user?.email) {
            fetchUserRoles();
        } else {
            // Reset state when no session
            setUserRoles([]);
            setCurrentRole('user');
            setError(null);
        }

        // Cleanup on session change
        return cleanup;
    }, [session?.user?.email, fetchUserRoles, cleanup]);

    // Cleanup on unmount
    useEffect(() => {
        return cleanup;
    }, [cleanup]);

    return {
        currentRole,
        userRoles,
        loading,
        switching,
        error,
        switchRole,
        refreshRoles,
        clearError,
        retryLastAction
    };
}