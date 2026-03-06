import React, { useMemo } from "react";
import { useParams } from "react-router-dom";
import VirtualScreenPage from "../virtual-screen/VirtualScreenPage";

export default function DevicePlayerPage() {
  const { code } = useParams();
  const pairingCode = useMemo(() => String(code ?? "").trim().toUpperCase(), [code]);
  return <VirtualScreenPage embed pairingCode={pairingCode} />;
}