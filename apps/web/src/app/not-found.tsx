import React from "react";

export default function NotFound() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-slate-950 text-slate-100 p-6">
      <div className="text-center space-y-4 max-w-md">
        <h2 className="text-2xl font-bold">Page Not Found</h2>
        <p className="text-sm text-slate-400">
          The requested clearance resource or page could not be found.
        </p>
        <a
          href="/"
          className="inline-block px-4 py-2 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-xs font-semibold text-white transition-colors"
        >
          Return to Dashboard
        </a>
      </div>
    </div>
  );
}
