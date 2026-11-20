import { useState } from 'react';
import { useTranslation } from '../../i18n/useTranslation';
import type { ProjectSummary } from '../../storage/projectRepository';
import { ConfirmDialog } from '../common/ConfirmDialog';
import { CreateProjectModal } from './CreateProjectModal';

export interface ProjectDashboardProps {
  projectSummaries: ProjectSummary[];
  isLoading: boolean;
  onCreateProject: (name: string) => Promise<void>;
  onOpenProject: (projectId: string) => void;
  onDeleteProject: (projectId: string) => Promise<void>;
}

export function ProjectDashboard({
  projectSummaries,
  isLoading,
  onCreateProject,
  onOpenProject,
  onDeleteProject,
}: ProjectDashboardProps) {
  const { locale, t } = useTranslation();
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [pendingDelete, setPendingDelete] = useState<ProjectSummary | null>(null);

  const handleConfirmDelete = async () => {
    if (!pendingDelete) return;
    const id = pendingDelete.project.id;
    setPendingDelete(null);
    await onDeleteProject(id);
  };

  return (
    <section className="mx-auto max-w-6xl px-4 py-8 sm:px-6">
      <div className="flex flex-col justify-between gap-4 rounded-2xl border border-slate-200 bg-white p-6 shadow-xs sm:flex-row sm:items-center">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">{t('dashboard.heading')}</h1>
          <p className="mt-1 text-sm text-slate-600">{t('dashboard.subheading')}</p>
        </div>
        {!isCreateOpen ? (
          <button
            type="button"
            data-testid="project-create-btn"
            onClick={() => setIsCreateOpen(true)}
            className="inline-flex items-center justify-center rounded-xl bg-indigo-600 px-5 py-2.5 text-sm font-semibold text-white shadow-xs transition hover:bg-indigo-700"
          >
            {t('dashboard.createProjectBtn')}
          </button>
        ) : null}
      </div>

      {!isLoading && projectSummaries.length === 0 ? (
        <div
          data-testid="dashboard-empty-state"
          className="mt-8 flex flex-col items-center justify-center rounded-2xl border-2 border-dashed border-slate-200 bg-white p-12 text-center"
        >
          <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-indigo-50 text-2xl font-bold text-indigo-600">
            +
          </div>
          <h2 className="mt-4 text-lg font-bold text-slate-900">
            {t('dashboard.emptyStateTitle')}
          </h2>
          <p className="mt-1 max-w-md text-sm text-slate-600">
            {t('dashboard.emptyStateBody')}
          </p>
        </div>
      ) : pendingDelete === null ? (
        <div className="mt-8 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {projectSummaries.map((summary) => {
            const { project, labelCount, sampleCount } = summary;
            const isTrained = Boolean(
              project.lastTrainedAt &&
                project.trainedLabelOrder &&
                project.trainedLabelOrder.length >= 2
            );
            const formattedDate = new Date(project.updatedAt).toLocaleDateString(
              locale === 'tr' ? 'tr-TR' : 'en-US'
            );

            return (
              <article
                key={project.id}
                data-testid="project-card"
                className="flex flex-col justify-between rounded-2xl border border-slate-200 bg-white p-5 shadow-xs transition hover:border-indigo-200 hover:shadow-md"
              >
                <div>
                  <div className="flex items-start justify-between gap-2">
                    <span className="rounded-lg bg-indigo-50 px-2.5 py-1 text-xs font-semibold text-indigo-700">
                      {t('dashboard.projectTypeBadge')}
                    </span>
                    <span
                      className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${
                        isTrained
                          ? 'bg-emerald-50 text-emerald-700'
                          : 'bg-slate-100 text-slate-600'
                      }`}
                    >
                      {isTrained
                        ? t('dashboard.trainedBadge')
                        : t('dashboard.untrainedBadge')}
                    </span>
                  </div>

                  <h2 className="mt-3 truncate text-lg font-bold text-slate-900">
                    {project.name}
                  </h2>

                  <div className="mt-2 inline-flex items-center rounded-lg bg-slate-100 px-2.5 py-1 text-xs font-semibold text-slate-700">
                    {t('dashboard.summaryBadge', {
                      labels: labelCount,
                      samples: sampleCount,
                    })}
                  </div>

                  <p className="mt-3 text-xs text-slate-400">
                    {t('dashboard.lastUpdated', { date: formattedDate })}
                  </p>
                </div>

                <div className="mt-5 flex items-center gap-2.5 border-t border-slate-100 pt-4">
                  <button
                    type="button"
                    data-testid="project-open-btn"
                    onClick={() => onOpenProject(project.id)}
                    className="flex-1 rounded-xl bg-indigo-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-indigo-700"
                  >
                    {t('dashboard.openProject')}
                  </button>
                  <button
                    type="button"
                    data-testid="project-delete-btn"
                    onClick={() => setPendingDelete(summary)}
                    className="rounded-xl border border-red-200 bg-red-50 px-3.5 py-2 text-sm font-semibold text-red-700 transition hover:bg-red-100"
                  >
                    {t('dashboard.deleteProject')}
                  </button>
                </div>
              </article>
            );
          })}
        </div>
      ) : null}

      <CreateProjectModal
        isOpen={isCreateOpen}
        onClose={() => setIsCreateOpen(false)}
        onCreate={onCreateProject}
      />

      <ConfirmDialog
        isOpen={pendingDelete !== null}
        message={
          pendingDelete
            ? t('dashboard.deleteConfirmMessage', { name: pendingDelete.project.name })
            : ''
        }
        onConfirm={handleConfirmDelete}
        onCancel={() => setPendingDelete(null)}
      />
    </section>
  );
}
