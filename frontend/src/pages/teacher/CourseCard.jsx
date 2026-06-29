function CourseTable({ courses }) {
  return (
    <table className="w-full text-sm">
      <thead>
        <tr className="text-left border-b">
          <th className="pb-4">Grupo</th>
          <th className="pb-4">Nivel</th>
          <th className="pb-4">Estudiantes</th>
          <th className="pb-4">Nivel académico</th>
          <th className="pb-4">Estado</th>
          <th className="pb-4">Acciones</th>
        </tr>
      </thead>
      <tbody>
        {courses.map(course => (
          <tr key={course._id} className="border-b hover:bg-gray-50">
            <td className="py-4">#{course.name}</td>
            <td className="py-4">{course.grade}</td>
            <td className="py-4">{course.students?.length || 0}</td>
            <td className="py-4">{course.averageTheta?.toFixed(2) || 0.88}</td>
            <td className="py-4"><span className="text-green-600">Activo</span></td>
            <td className="py-4">
              <button className="bg-blue-600 text-white px-6 py-2 rounded-2xl font-medium">Gestionar</button>
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

export default CourseTable;