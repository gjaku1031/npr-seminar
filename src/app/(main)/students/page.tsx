import { listClasses, listStudents, requireModuleAccess } from "@/server/services";
import { ModuleScaffold, ScaffoldCount } from "@/shared/ui";

export const dynamic = "force-dynamic";

/**
 * 재원생 관리 (명세 §4). 강사(gangsa)는 차단 — requireModuleAccess가 판정 (flows GANGSA-G1).
 */
export default async function StudentsPage() {
  await requireModuleAccess("students");

  const [students, classes] = await Promise.all([listStudents(), listClasses()]);

  return (
    <ModuleScaffold
      title="재원생 관리"
      description="명단·검색·필터·엑셀·노쇼 회수"
      spec="§4 · 12.4 · 12.8 · 12.14"
    >
      <div className="flex flex-wrap gap-2">
        <ScaffoldCount label="재원생" value={students.length} />
        <ScaffoldCount label="반" value={classes.length} />
        <ScaffoldCount label="전환 학생" value={students.filter((s) => s.convertedFrom !== null).length} />
      </div>
    </ModuleScaffold>
  );
}
