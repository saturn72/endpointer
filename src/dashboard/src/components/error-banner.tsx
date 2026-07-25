/**
 * ErrorBanner — shared component for the two distinct error classes.
 *
 * validation  Red destructive Alert with the specific, actionable message.
 *             Used for errors caused by bad user input (e.g. duplicate name,
 *             invalid CSV headers). The message is safe to display as-is.
 *
 * infra        Amber Alert with a generic "server error" message.
 *              Used when MongoDB or S3 calls fail. The real error is only
 *              logged server-side; raw error details are never shown here.
 */
import { Alert, AlertDescription } from '@/components/ui/alert';
import { AlertCircle, ServerCrash } from 'lucide-react';

interface ErrorBannerProps {
    type: 'validation' | 'infra';
    message: string;
}

export function ErrorBanner({ type, message }: ErrorBannerProps) {
    if (type === 'infra') {
        return (
            <Alert
                role="alert"
                className="border-amber-200 bg-amber-50 text-amber-900 [&>svg]:text-amber-600"
            >
                <ServerCrash className="h-4 w-4" />
                <AlertDescription>{message}</AlertDescription>
            </Alert>
        );
    }
    return (
        <Alert role="alert" variant="destructive">
            <AlertCircle className="h-4 w-4" />
            <AlertDescription>{message}</AlertDescription>
        </Alert>
    );
}
