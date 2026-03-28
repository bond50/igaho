// features/auth/components/logout-button.tsx
import { LogOut } from 'lucide-react';
import { logout } from '@/features/auth/actions/logout';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

type LogoutButtonProps = {
  className?: string;
};

export function LogoutButton({ className }: LogoutButtonProps) {
  return (
    <form action={logout}>
      <Button type="submit" variant="outline" size="sm" className={cn(className)}>
        <LogOut className="mr-2 h-4 w-4" />
        Log out
      </Button>
    </form>
  );
}
