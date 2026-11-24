import React, { createContext, useContext, useEffect, useState } from 'react';
import authService from '../client/auth.client';
import { isAway, backNow, lastUser, serverReady, attemptTokenRefresh } from '../client/app.client';
import { useNotification } from './NotificationContext';

const AuthContext = createContext();

export const useAuth = () => {
    const context = useContext(AuthContext);
    if (context === undefined) {
        throw new Error('useAuth must be used within an AuthProvider');
    }
    return context;
};

export const AuthProvider = ({ children }) => {
    const [user, setUser] = useState(null);
    const [isLoading, setIsLoading] = useState(true);
    // Set after a long time away: the login page then offers one click to carry on as this person.
    const [resume, setResume] = useState(null);
    const { error: showError, success: showSuccess } = useNotification();

    const signedIn = (who) => {
        backNow();
        lastUser(who?.username || null);
        setResume(null);
        setUser(who);
    };

    const stepAway = (username) => {
        const { pathname, search } = window.location;
        const from = ['/login', '/signup', '/forgot-password'].includes(pathname) ? '/' : pathname + search;
        setResume((now) => now || { username, from });
        setUser(null);
    };

    const initAuth = async () => {
        const known = lastUser();
        if (known && isAway()) {
            stepAway(known);
            setIsLoading(false);
            return;
        }
        try {
            const response = await authService.getUserProfile();
            signedIn(response.user || response);
        } catch (error) {
            setUser(null);
        } finally {
            setIsLoading(false);
        }
    };

    useEffect(() => {
        initAuth();
    }, []);

    useEffect(() => {
        if (!user) return undefined;
        const check = () => { if (isAway()) stepAway(user.username); };
        const timer = setInterval(check, 15000);
        window.addEventListener('authAway', check);
        return () => {
            clearInterval(timer);
            window.removeEventListener('authAway', check);
        };
    }, [user]);

    // Another tab carried on or signed out: this one follows.
    useEffect(() => {
        if (!resume) return undefined;
        const follow = (event) => {
            if (event.key !== 'auth:away' || event.newValue) return;
            setResume(null);
            initAuth();
        };
        window.addEventListener('storage', follow);
        return () => window.removeEventListener('storage', follow);
    }, [resume]);

    // One click after a long time away: the refresh token is sent, no password.
    const continueSession = async () => {
        const from = resume?.from || '/';
        try {
            await serverReady();
            await attemptTokenRefresh();
            backNow();
            const response = await authService.getUserProfile();
            signedIn(response.user || response);
            return from;
        } catch (error) {
            if ([400, 401, 403].includes(error.response?.status)) {
                lastUser(null);
                backNow();
                setResume(null);
                showError('Your session has ended. Please sign in with your password.');
            } else {
                showError(navigator.onLine === false ? 'You are offline. Check your connection and try again.' : 'The server did not answer. Try again in a minute.');
            }
            throw error;
        }
    };

    const signOutAway = async () => {
        try {
            await attemptTokenRefresh();
            backNow();
            await authService.logout();
        } catch (error) {
            // The session had already ended
        }
        lastUser(null);
        backNow();
        setResume(null);
    };

    // Clear user state when the refresh interceptor gives up
    // (e.g. refresh token expired or all retries exhausted)
    useEffect(() => {
        const handleAuthFailure = () => setUser(null);
        window.addEventListener('authFailure', handleAuthFailure);
        return () => window.removeEventListener('authFailure', handleAuthFailure);
    }, []);

    // Simple login
    // Deliberately does NOT toggle the global isLoading: RouteAccessControl
    // unmounts the current page while it is true, which would destroy the
    // login form's state mid-flow (e.g. the 2FA step).
    const login = async (credentials) => {
        try {
            const response = await authService.login(credentials);
            // Password accepted but a 2FA code is still required — no session yet
            if (response.requiresTwoFactor) {
                return response;
            }
            signedIn(response.user || response);
            return response;
        } catch (error) {
            showError(error.response?.data?.message || 'Login failed');
            throw error;
        }
    };

    // Simple signup
    const signup = async (userData) => {
        setIsLoading(true);
        try {
            const response = await authService.signup(userData);
            signedIn(response.user || response);
            showSuccess('Account created successfully');
            return response;
        } catch (error) {
            showError(error.response?.data?.message || 'Signup failed');
            throw error;
        } finally {
            setIsLoading(false);
        }
    };

    // Simple logout
    const logout = async () => {
        try {
            await authService.logout();
        } catch (error) {
            // Continue with logout even if server call fails
        } finally {
            lastUser(null);
            setResume(null);
            setUser(null);
            showSuccess('Logged out successfully');
        }
    };

    // Simple forgot password
    const forgotPassword = async (email) => {
        try {
            const response = await authService.forgotPassword(email);
            showSuccess('Password reset email sent');
            return response;
        } catch (error) {
            showError(error.response?.data?.message || 'Failed to send reset email');
            throw error;
        }
    };

    // Simple reset password
    const resetPassword = async (token, newPassword) => {
        setIsLoading(true);
        try {
            const response = await authService.resetPassword({ token, newPassword });
            signedIn(response.user || response);
            showSuccess('Password reset successfully');
            return response;
        } catch (error) {
            showError(error.response?.data?.message || 'Password reset failed');
            throw error;
        } finally {
            setIsLoading(false);
        }
    };

    // Simple role checking
    const hasRole = (role) => {
        return user?.roles?.includes(role) || false;
    };

    const value = {
        user,
        isLoading,
        resume,
        continueSession,
        signOutAway,
        login,
        signup,
        logout,
        forgotPassword,
        resetPassword,
        hasRole,
        isAdmin: () => hasRole('ADMIN'),
        isOwner: () => hasRole('OWNER'),
    };

    return (
        <AuthContext.Provider value={value}>
            {children}
        </AuthContext.Provider>
    );
};

export default AuthContext;
