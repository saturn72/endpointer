'use client';

import { useState, useTransition } from 'react';
import {
    AlertDialog,
    AlertDialogAction,
    AlertDialogCancel,
    AlertDialogContent,
    AlertDialogDescription,
    AlertDialogFooter,
    AlertDialogHeader,
    AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Button } from '@/components/ui/button';
import { Globe, Lock, Loader2 } from 'lucide-react';
import { setVersionPublished } from '@/actions/endpoints';

interface PublishToggleProps {
    endpointName: string;
    major: number;
    minor: number;
    initialPublished: boolean;
}

export function PublishToggle({ endpointName, major, minor, initialPublished }: PublishToggleProps) {
    const [published, setPublished] = useState(initialPublished);
    const [confirmOpen, setConfirmOpen] = useState(false);
    const [isPending, startTransition] = useTransition();

    const handleClick = () => {
        if (published) {
            // Unpublishing requires confirmation first.
            setConfirmOpen(true);
        } else {
            // Publishing is immediate — no dialog needed.
            startTransition(async () => {
                await setVersionPublished(endpointName, major, minor, true);
                setPublished(true);
            });
        }
    };

    const handleConfirmUnpublish = () => {
        setConfirmOpen(false);
        startTransition(async () => {
            await setVersionPublished(endpointName, major, minor, false);
            setPublished(false);
        });
    };

    return (
        <>
            <Button
                variant={published ? 'default' : 'outline'}
                size="sm"
                onClick={handleClick}
                disabled={isPending}
                className={
                    published
                        ? 'bg-primary text-primary-foreground hover:bg-primary/90'
                        : 'text-muted-foreground'
                }
            >
                {isPending ? (
                    <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />
                ) : published ? (
                    <Globe className="h-3.5 w-3.5 mr-1.5" />
                ) : (
                    <Lock className="h-3.5 w-3.5 mr-1.5" />
                )}
                {published ? 'Published' : 'Unpublished'}
            </Button>

            <AlertDialog open={confirmOpen} onOpenChange={setConfirmOpen}>
                <AlertDialogContent>
                    <AlertDialogHeader>
                        <AlertDialogTitle>Unpublish Version</AlertDialogTitle>
                        <AlertDialogDescription>
                            Are you sure you want to unpublish this version? This will remove the
                            data from the public API and require re-approval to go live again.
                        </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                        <AlertDialogCancel>Cancel</AlertDialogCancel>
                        <AlertDialogAction
                            onClick={handleConfirmUnpublish}
                            className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                        >
                            Confirm Unpublish
                        </AlertDialogAction>
                    </AlertDialogFooter>
                </AlertDialogContent>
            </AlertDialog>
        </>
    );
}
