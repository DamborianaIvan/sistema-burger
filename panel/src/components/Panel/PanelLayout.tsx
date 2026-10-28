import { Outlet } from "react-router-dom";
import Sidebar from "./Sidebar";
import "./PanelLayout.css";
import "./Operations.css";

const PanelLayout = () => {
  return (
    <div className="panel-layout">
      <Sidebar />
      <main className="panel-content" id="panel-content">
        <Outlet />
      </main>
    </div>
  );
};

export default PanelLayout;

