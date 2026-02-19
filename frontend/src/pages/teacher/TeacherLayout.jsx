// frontend/src/pages/teacher/TeacherLayout.jsx
import { Outlet } from 'react-router-dom';
import TeacherSidebar from './TeacherSidebar.jsx'; 

function TeacherLayout() {
  return (
    <div className="flex min-h-screen bg-[#F4F6F8]">
      <TeacherSidebar />
      <main className="flex-1 p-10">
        <Outlet />
      </main>
    </div>
  );
}

export default TeacherLayout;