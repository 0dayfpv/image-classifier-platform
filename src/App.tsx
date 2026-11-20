import { DEFAULT_TRAINING_CONFIG } from './types/domain';
import { I18nProvider } from './i18n/I18nContext';
import { useTranslation } from './i18n/useTranslation';
import { useProjectWorkspace } from './hooks/useProjectWorkspace';
import { useTrainingSession } from './hooks/useTrainingSession';
import { TopNavbar } from './components/layout/TopNavbar';
import { ProjectDashboard } from './components/dashboard/ProjectDashboard';
import { TrainStage } from './components/train/TrainStage';
import { LearnTestStage } from './components/learn/LearnTestStage';
import { MakeStage } from './components/make/MakeStage';

function WorkspaceApp() {
  const { locale } = useTranslation();
  const currentYear = Math.max(2026, new Date().getFullYear());
  const {
    projectSummaries,
    isLoadingDashboard,
    activeProjectId,
    activeProject,
    activeStage,
    setActiveStage,
    labels,
    samples,
    createProject,
    openProject,
    navigateHome,
    deleteProject,
    createLabel,
    renameLabel,
    deleteLabel,
    addSample,
    deleteSample,
    updateReaction,
    recordTrainingComplete,
  } = useProjectWorkspace();

  const {
    isTrained,
    isStaleModel,
    isTraining,
    trainedLabels,
    progress,
    telemetry,
    trainingErrorKey,
    predictions,
    startTraining,
    cancelTraining,
    predict,
    exportModel,
  } = useTrainingSession({
    projectId: activeProjectId,
    labels,
    samples,
    trainedLabelOrder: activeProject?.trainedLabelOrder,
    onTrainingSaved: recordTrainingComplete,
  });

  const navbarProject =
    activeProject ??
    (activeProjectId
      ? {
          id: activeProjectId,
          name: '',
          createdAt: 0,
          updatedAt: 0,
          trainingConfig: DEFAULT_TRAINING_CONFIG,
          reactions: {},
        }
      : null);

  return (
    <div className="flex min-h-screen flex-col bg-slate-50 text-slate-900">
      <TopNavbar
        activeProject={navbarProject}
        activeStage={activeStage}
        onSelectStage={setActiveStage}
        onNavigateHome={navigateHome}
      />

      <main className="flex-1">
        {!activeProjectId ? (
          <ProjectDashboard
            projectSummaries={projectSummaries}
            isLoading={isLoadingDashboard}
            onCreateProject={createProject}
            onOpenProject={openProject}
            onDeleteProject={deleteProject}
          />
        ) : (
          <>
            {activeStage === 'train' ? (
              <TrainStage
                projectId={activeProjectId}
                labels={labels}
                samples={samples}
                onCreateLabel={createLabel}
                onRenameLabel={renameLabel}
                onDeleteLabel={deleteLabel}
                onAddSample={addSample}
                onDeleteSample={deleteSample}
                onProceedToLearn={() => setActiveStage('learn')}
              />
            ) : null}

            {activeStage === 'learn' ? (
              <LearnTestStage
                labels={labels}
                samples={samples}
                trainingConfig={
                  activeProject?.trainingConfig ?? DEFAULT_TRAINING_CONFIG
                }
                isTrained={isTrained}
                isStaleModel={isStaleModel}
                isTraining={isTraining}
                progress={progress}
                telemetry={telemetry}
                trainingErrorKey={trainingErrorKey}
                predictions={predictions}
                onTrainModel={startTraining}
                onCancelTraining={cancelTraining}
                onPredict={predict}
              />
            ) : null}

            {activeStage === 'make' ? (
              <MakeStage
                isTrained={isTrained}
                trainedLabels={trainedLabels}
                reactions={activeProject?.reactions ?? {}}
                onUpdateReaction={updateReaction}
                onPredict={predict}
                onExportModel={exportModel}
              />
            ) : null}
          </>
        )}
      </main>

      <footer className="mt-auto border-t border-slate-200 bg-white py-4 text-center text-xs font-medium text-slate-500">
        © 2025–{currentYear}{' '}
        <a
          href="https://hamzafpv.com.tr"
          target="_blank"
          rel="noopener noreferrer"
          className="font-semibold text-indigo-600 transition hover:text-indigo-700 hover:underline"
        >
          hamzafpv.com.tr
        </a>
        {' • '}
        <span>
          {locale === 'tr' ? 'Tüm hakları saklıdır.' : 'All rights reserved.'}
        </span>
      </footer>
    </div>
  );
}

export default function App() {
  return (
    <I18nProvider>
      <WorkspaceApp />
    </I18nProvider>
  );
}
