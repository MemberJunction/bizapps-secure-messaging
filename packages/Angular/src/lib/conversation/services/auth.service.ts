import { Injectable } from '@angular/core';
import { SecureMessagingApiService, AuthResponse } from './api.service';

export type AuthState = 'loading' | 'authenticated' | 'expired' | 'error';

/**
 * Manages authentication state for the secure messaging widget.
 * Token is stored in memory only (not localStorage) for security.
 */
@Injectable({ providedIn: 'root' })
export class AuthService {
    private _state: AuthState = 'loading';
    private _session: AuthResponse | null = null;
    private _errorMessage = '';

    constructor(private api: SecureMessagingApiService) {}

    get state(): AuthState { return this._state; }
    get session(): AuthResponse | null { return this._session; }
    get errorMessage(): string { return this._errorMessage; }

    /**
     * Validate a session token (from URL ?token= param).
     */
    async validateToken(token: string): Promise<boolean> {
        this._state = 'loading';
        try {
            const response = await this.api.validateToken(token);
            this._session = response;
            this.api.updateToken(response.token);
            this._state = 'authenticated';
            return true;
        } catch (error) {
            this.handleError(error);
            return false;
        }
    }

    /**
     * Redeem a magic link token (from URL ?ml= param).
     */
    async redeemMagicLink(mlToken: string): Promise<boolean> {
        this._state = 'loading';
        try {
            const response = await this.api.redeemMagicLink(mlToken);
            this._session = response;
            this.api.updateToken(response.token);
            this._state = 'authenticated';
            return true;
        } catch (error) {
            this.handleError(error);
            return false;
        }
    }

    clear(): void {
        this._state = 'loading';
        this._session = null;
        this._errorMessage = '';
        this.api.updateToken('');
    }

    private handleError(error: unknown): void {
        if (error instanceof Error && 'statusCode' in error) {
            const statusCode = (error as { statusCode: number }).statusCode;
            if (statusCode === 401) {
                this._state = 'expired';
                this._errorMessage = 'Your session has expired. Please request a new link.';
            } else {
                this._state = 'error';
                this._errorMessage = error.message;
            }
        } else {
            this._state = 'error';
            this._errorMessage = 'An unexpected error occurred.';
        }
    }
}
