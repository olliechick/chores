// file: src/hooks/useLocalStorage.ts
import { useEffect, useState } from 'react';

/**
 * A custom hook to manage state in localStorage.
 *
 * @param key The key to use in localStorage.
 * @param initialValue The initial value if nothing is in localStorage.
 * @returns A stateful value, and a function to update it.
 */
export function useLocalStorage<T>(key: string, initialValue: T): [T, (value: T) => void] {
    // Get stored value from localStorage or use initial value
    const getStoredValue = (): T => {
        try {
            const item = window.localStorage.getItem(key);
            return item ? (JSON.parse(item) as T) : initialValue;
        } catch (error) {
            console.warn(`Error reading localStorage key “${key}”:`, error);
            return initialValue;
        }
    };

    // State to store our value
    const [storedValue, setStoredValue] = useState<T>(getStoredValue);

    // Update localStorage when the state changes
    useEffect(() => {
        try {
            window.localStorage.setItem(key, JSON.stringify(storedValue));
        } catch (error) {
            console.warn(`Error setting localStorage key “${key}”:`, error);
        }
    }, [key, storedValue]);

    // We return the value and the setter function, just like useState
    return [storedValue, setStoredValue];
}