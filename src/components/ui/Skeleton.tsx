import React from "react";

interface SkeletonProps {
  className?: string;
}

export function Skeleton({ className = "" }: SkeletonProps) {
  return <div className={`animate-pulse bg-gray-200 rounded ${className}`} />;
}

export function SkeletonLine({ className = "" }: SkeletonProps) {
  return <Skeleton className={`h-4 w-full ${className}`} />;
}

export function SkeletonCard({ className = "" }: SkeletonProps) {
  return (
    <div className={`bg-white border border-card-border rounded-card p-4 ${className}`}>
      <SkeletonLine className="w-3/4 mb-3" />
      <SkeletonLine className="w-1/2 mb-3" />
      <SkeletonLine className="w-full" />
    </div>
  );
}

export function SkeletonTable({ className = "" }: SkeletonProps) {
  return (
    <div className={`bg-white border border-card-border rounded-card overflow-hidden ${className}`}>
      {Array.from({ length: 5 }).map((_, i) => (
        <div
          key={i}
          className={`flex items-center gap-4 px-4 py-3 ${
            i < 4 ? "border-b border-[#E8E6DF]" : ""
          }`}
        >
          <Skeleton className="h-4 w-1/4" />
          <Skeleton className="h-4 w-1/3" />
          <Skeleton className="h-4 w-1/6" />
          <Skeleton className="h-4 w-1/5 ml-auto" />
        </div>
      ))}
    </div>
  );
}
