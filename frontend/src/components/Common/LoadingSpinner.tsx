export function LoadingSpinner({ message = 'Cargando...' }: { message?: string }) {
  return (
    <div className="flex flex-col items-center justify-center min-h-screen bg-pink-50">
      <div className="animate-spin rounded-full h-12 w-12 border-4 border-pink-200 border-t-pink-600 mb-4" />
      <p className="text-pink-700 font-medium">{message}</p>
    </div>
  );
}
