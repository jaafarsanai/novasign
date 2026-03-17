import React, { useEffect, useState } from "react";
import { Navigate } from "react-router-dom";
import { getMe, type MeResponse } from "../../lib/auth";

type Props = {
  children: React.ReactNode;
};

export default function ProtectedRoute({ children }: Props) {
  const [loading, setLoading] = useState(true);
  const [user, setUser] = useState<MeResponse | null>(null);

  useEffect(() => {
    let mounted = true;

    getMe().then((me) => {
      if (!mounted) return;
      setUser(me);
      setLoading(false);
    });

    return () => {
      mounted = false;
    };
  }, []);

  if (loading) {
    return <div style={{ padding: 24 }}>Loading...</div>;
  }

  if (!user) {
    return <Navigate to="/login" replace />;
  }

  return <>{children}</>;
}