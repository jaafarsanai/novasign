import React from "react";
import { useParams } from "react-router-dom";
import VirtualScreenPage from "../virtual-screen/VirtualScreenPage";

export default function PlayerPage() {
  const { code } = useParams();
  return <VirtualScreenPage embed pairingCode={String(code ?? "").trim().toUpperCase()} />;
}