import React, { useEffect, useState } from 'react';
import { AlertTriangle, Save, X } from 'lucide-react';

/**
 * Props for the SettingsPage component
 */
export interface SettingsPageProps {
    initialToken: string | null;
    initialChoreDbId: string | null;
    initialChoreLogDbId: string | null;

    /**
     * An error message passed from the parent (e.g., "must save first")
     */
    parentError: string | null;

    onSave: (settings: { token: string, choreDbId: string, choreLogDbId: string }) => void;
    onClose: () => void;

    /**
     * A callback to clear the parent's error message
     */
    clearParentError: () => void;
}

/**
 * A modal component for users to input their Notion API settings.
 */
export const SettingsPage: React.FC<SettingsPageProps> = ({
                                                              initialToken,
                                                              initialChoreDbId,
                                                              initialChoreLogDbId,
                                                              parentError,
                                                              onSave,
                                                              onClose,
                                                              clearParentError,
                                                          }) => {
    const [token, setToken] = useState('');
    const [choreDbId, setChoreDbId] = useState('');
    const [choreLogDbId, setChoreLogDbId] = useState('');

    // Internal state for validation errors
    const [internalError, setInternalError] = useState<string | null>(null);

    useEffect(() => {
        setToken(initialToken || '');
        setChoreDbId(initialChoreDbId || '');
        setChoreLogDbId(initialChoreLogDbId || '');
    }, [initialToken, initialChoreDbId, initialChoreLogDbId]);

    /**
     * Helper to clear errors when the user starts typing
     */
    const handleInputChange = () => {
        setInternalError(null);
        clearParentError();
    };

    /**
     * Handles the save button click.
     * Validates input and calls the onSave prop.
     */
    const handleSave = () => {
        handleInputChange(); // Clear errors on attempt

        if (!token.trim() || !choreDbId.trim() || !choreLogDbId.trim()) {
            setInternalError("Please fill in all three fields.");
            return;
        }

        onSave({
            token: token.trim(),
            choreDbId: choreDbId.trim(),
            choreLogDbId: choreLogDbId.trim(),
        });
    };

    // Show the parent error first, fallback to internal validation error
    const displayError = parentError || internalError;

    return (
        // Full-screen modal backdrop
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">

            {/* Modal Panel */}
            <div className="bg-white rounded-xl shadow-2xl p-6 w-full max-w-md relative">

                {/* Modal Header */}
                <div className="flex justify-between items-center mb-6 pb-4 border-b border-gray-200">
                    <h2 className="text-2xl font-bold text-gray-800">Settings</h2>
                    <button
                        onClick={onClose}
                        className="text-gray-400 hover:text-gray-600 p-1 rounded-full transition-colors"
                        aria-label="Close settings"
                    >
                        <X className="w-6 h-6" />
                    </button>
                </div>

                {/* Form Inputs */}
                <div className="space-y-4">

                    {/* Token Input */}
                    <div>
                        <label htmlFor="token" className="block text-sm font-medium text-gray-700 mb-1">
                            Notion API token
                        </label>
                        <input
                            id="token"
                            type="password"
                            value={token}
                            onChange={(e) => {
                                setToken(e.target.value);
                                handleInputChange();
                            }}
                            placeholder="secret_..."
                            className={`w-full px-3 py-2 border rounded-lg shadow-sm focus:outline-none focus:ring-2 
                                        ${displayError ? 'border-red-500 focus:ring-red-500' : 'border-gray-300 focus:ring-indigo-500'}`}
                        />
                    </div>

                    {/* Chore DB ID Input */}
                    <div>
                        <label htmlFor="choreDbId" className="block text-sm font-medium text-gray-700 mb-1">
                            Chore database ID
                        </label>
                        <input
                            id="choreDbId"
                            type="text"
                            value={choreDbId}
                            onChange={(e) => {
                                setChoreDbId(e.target.value);
                                handleInputChange();
                            }}
                            placeholder="xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx"
                            className={`w-full px-3 py-2 border rounded-lg shadow-sm focus:outline-none focus:ring-2 
                                        ${displayError ? 'border-red-500 focus:ring-red-500' : 'border-gray-300 focus:ring-indigo-500'}`}
                        />
                    </div>

                    {/* Chore Log DB ID Input */}
                    <div>
                        <label htmlFor="choreLogDbId" className="block text-sm font-medium text-gray-700 mb-1">
                            Chore Log database ID
                        </label>
                        <input
                            id="choreLogDbId"
                            type="text"
                            value={choreLogDbId}
                            onChange={(e) => {
                                setChoreLogDbId(e.target.value);
                                handleInputChange();
                            }}
                            placeholder="xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx"
                            className={`w-full px-3 py-2 border rounded-lg shadow-sm focus:outline-none focus:ring-2 
                                        ${displayError ? 'border-red-500 focus:ring-red-500' : 'border-gray-300 focus:ring-indigo-500'}`}
                        />
                    </div>

                    <p className="text-xs text-gray-500 pt-2">
                        These values are saved in your browser's local storage.
                    </p>
                </div>

                {/* Inline Error Message Area */}
                <div className="mt-4 min-h-[40px]"> {/* Reserve space to prevent layout jump */}
                    {displayError && (
                        <div className="flex items-center bg-red-50 text-red-700 p-3 rounded-lg border border-red-200">
                            <AlertTriangle className="w-5 h-5 mr-2 flex-shrink-0" />
                            <p className="text-sm">{displayError}</p>
                        </div>
                    )}
                </div>

                {/* Modal Footer / Actions */}
                <div className="mt-4 flex justify-end gap-3">
                    <button
                        onClick={onClose}
                        className="px-4 py-2 text-sm font-semibold rounded-lg bg-gray-100 text-gray-700 hover:bg-gray-200 transition-colors"
                    >
                        Cancel
                    </button>
                    <button
                        onClick={handleSave}
                        className="flex items-center px-4 py-2 text-sm font-semibold rounded-lg bg-indigo-600 text-white hover:bg-indigo-700 shadow-md hover:shadow-lg transition-all"
                    >
                        <Save className="w-4 h-4 mr-2" />
                        Save settings
                    </button>
                </div>
            </div>
        </div>
    );
};