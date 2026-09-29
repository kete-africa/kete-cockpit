import { createFileRoute, redirect } from '@tanstack/react-router';

export const Route = createFileRoute('/_operator/')({
  beforeLoad: () => {
    throw redirect({ to: '/apps' });
  },
});
