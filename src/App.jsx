import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { emptyLibrary, loadCloudLibrary, readLegacyLibrary, saveCloudLibrary } from "./cloudLibrary";
import { supabase } from "./supabaseClient";

const publicAsset = (path) => `${import.meta.env.BASE_URL}${path}`;

const icons = {
  search: publicAsset("icons/search.svg"),
  plus: publicAsset("icons/plus.svg"),
  grid: publicAsset("icons/layout-grid.svg"),
  star: publicAsset("icons/star.svg"),
  starFilled: publicAsset("icons/star-filled.svg"),
  folder: publicAsset("icons/folder.svg"),
  info: publicAsset("icons/info-circle.svg"),
  copy: publicAsset("icons/copy.svg"),
  pencil: publicAsset("icons/pencil.svg"),
  close: publicAsset("icons/x.svg"),
  chevron: publicAsset("icons/chevron-down.svg"),
  photo: publicAsset("icons/photo.svg"),
  trash: publicAsset("icons/trash.svg"),
  grip: publicAsset("icons/dots-vertical.svg"),
  check: publicAsset("icons/check.svg"),
  bold: publicAsset("icons/bold.svg"),
  italic: publicAsset("icons/italic.svg"),
  list: publicAsset("icons/list-details.svg"),
  code: publicAsset("icons/code.svg"),
  link: publicAsset("icons/link.svg"),
};

function Icon({ name, size = 18, light = false }) {
  return <img className={light ? "icon icon-light" : "icon"} src={icons[name]} width={size} height={size} alt="" aria-hidden="true" />;
}

function inlineMarkdown(text) {
  const parts = text.split(/(\*\*[^*]+\*\*|`[^`]+`|\*[^*]+\*)/g);
  return parts.map((part, index) => {
    if (part.startsWith("**") && part.endsWith("**")) return <strong key={index}>{part.slice(2, -2)}</strong>;
    if (part.startsWith("`") && part.endsWith("`")) return <code key={index}>{part.slice(1, -1)}</code>;
    if (part.startsWith("*") && part.endsWith("*")) return <em key={index}>{part.slice(1, -1)}</em>;
    return part;
  });
}

function PromptBody({ content }) {
  return (
    <div className="prompt-body">
      {content.split("\n").map((line, index) => {
        if (!line) return <div className="body-space" key={index} />;
        if (/^\d+\.\s/.test(line)) return <div className="body-list-row" key={index}>{inlineMarkdown(line)}</div>;
        if (line.startsWith("— ")) return <div className="body-list-row dash" key={index}>{inlineMarkdown(line)}</div>;
        return <p key={index}>{inlineMarkdown(line)}</p>;
      })}
    </div>
  );
}

function PromptCard({ prompt, selected, copied, onOpen, onCopy, onFavorite }) {
  return (
    <article className={`prompt-card${selected ? " selected" : ""}`} onClick={() => onOpen(prompt.id)} tabIndex={0} onKeyDown={(event) => event.key === "Enter" && onOpen(prompt.id)}>
      <button className={`favorite-button${prompt.favorite ? " active" : ""}`} aria-label={prompt.favorite ? "Убрать из избранного" : "Добавить в избранное"} onClick={(event) => { event.stopPropagation(); onFavorite(prompt.id); }}>
        <Icon name={prompt.favorite ? "starFilled" : "star"} size={18} />
      </button>
      {prompt.image && <img className="card-preview" src={prompt.image} alt="" />}
      <div className="card-content">
        <h3>{prompt.title}</h3>
        <div className="card-footer">
          <span className="card-topic"><Icon name="folder" size={15} />{prompt.topic}</span>
          <button className={`card-copy${copied ? " copied" : ""}`} aria-label="Скопировать промпт" onClick={(event) => { event.stopPropagation(); onCopy(prompt); }}>
            <Icon name={copied ? "check" : "copy"} size={18} />
          </button>
        </div>
      </div>
    </article>
  );
}

function FormatToolbar({ textareaRef, value, onChange }) {
  const apply = (prefix, suffix = prefix) => {
    const node = textareaRef.current;
    if (!node) return;
    const start = node.selectionStart;
    const end = node.selectionEnd;
    if (start === end) {
      node.focus();
      return;
    }
    const selected = value.slice(start, end);
    onChange(`${value.slice(0, start)}${prefix}${selected}${suffix}${value.slice(end)}`);
    requestAnimationFrame(() => {
      node.focus();
      node.setSelectionRange(start + prefix.length, start + prefix.length + selected.length);
    });
  };
  return (
    <div className="format-toolbar" aria-label="Форматирование">
      <button type="button" onClick={() => apply("**")} aria-label="Жирный"><Icon name="bold" size={16} /></button>
      <button type="button" onClick={() => apply("*")} aria-label="Курсив"><Icon name="italic" size={16} /></button>
      <button type="button" onClick={() => apply("- ", "")} aria-label="Список"><Icon name="list" size={16} /></button>
      <button type="button" onClick={() => apply("`", "`")} aria-label="Код"><Icon name="code" size={16} /></button>
      <button type="button" onClick={() => apply("[", "](https://)")} aria-label="Ссылка"><Icon name="link" size={16} /></button>
    </div>
  );
}

function EditorPanel({ mode, prompt, topics, onClose, onCreate, onUpdate, onAddTopic }) {
  const [draft, setDraft] = useState(() => ({ title: prompt?.title || "", topic: prompt?.topic || topics[0] || "Без темы", content: prompt?.content || "", image: prompt?.image || null, imagePath: prompt?.imagePath || null }));
  const [saved, setSaved] = useState(false);
  const [topicCreatorOpen, setTopicCreatorOpen] = useState(false);
  const [topicName, setTopicName] = useState("");
  const textareaRef = useRef(null);
  const fileRef = useRef(null);

  useEffect(() => {
    setDraft({ title: prompt?.title || "", topic: prompt?.topic || topics[0] || "Без темы", content: prompt?.content || "", image: prompt?.image || null, imagePath: prompt?.imagePath || null });
  }, [prompt?.id, mode]);

  useEffect(() => {
    if (mode !== "edit" || !prompt) return undefined;
    const timer = window.setTimeout(() => {
      onUpdate(prompt.id, draft);
      setSaved(true);
      window.setTimeout(() => setSaved(false), 1200);
    }, 450);
    return () => window.clearTimeout(timer);
  }, [draft, mode, onUpdate, prompt?.id]);

  const readImage = (file) => {
    if (!file?.type.startsWith("image/")) return;
    const reader = new FileReader();
    reader.onload = () => setDraft((current) => ({ ...current, image: reader.result, imagePath: null }));
    reader.readAsDataURL(file);
  };
  const handlePaste = (event) => {
    const file = [...event.clipboardData.files].find((item) => item.type.startsWith("image/"));
    if (file) { event.preventDefault(); readImage(file); }
  };
  const submit = (event) => {
    event.preventDefault();
    if (mode === "create" && draft.title.trim() && draft.content.trim()) onCreate(draft);
  };
  const createTopic = () => {
    const topic = onAddTopic(topicName);
    if (!topic) return;
    setDraft((current) => ({ ...current, topic }));
    setTopicName("");
    setTopicCreatorOpen(false);
  };

  return (
    <aside className="detail-panel editor-panel" onPaste={handlePaste}>
      <div className="panel-header compact">
        <div><p className="eyebrow">{mode === "create" ? "Новый промпт" : "Редактирование"}</p><h2>{mode === "create" ? "Добавить в библиотеку" : prompt.title}</h2></div>
        <button className="icon-button" onClick={onClose} aria-label="Закрыть"><Icon name="close" size={21} /></button>
      </div>
      <form className="prompt-form" onSubmit={submit} onKeyDown={(event) => {
        if ((event.metaKey || event.ctrlKey) && event.key === "Enter") submit(event);
      }}>
        <label><span>Название</span><input autoFocus={mode === "create"} value={draft.title} onChange={(event) => setDraft({ ...draft, title: event.target.value })} placeholder="Короткое название" /></label>
        <div className="topic-field">
          <span>Тема</span>
          <div className="topic-picker">
            <select aria-label="Тема" value={draft.topic} onChange={(event) => setDraft({ ...draft, topic: event.target.value })}>{topics.map((topic) => <option key={topic}>{topic}</option>)}<option>Без темы</option></select>
            <button type="button" className="topic-add-button" onClick={() => setTopicCreatorOpen((open) => !open)} aria-label="Создать тему" aria-expanded={topicCreatorOpen}><Icon name="plus" size={18} /></button>
          </div>
          {topicCreatorOpen && (
            <div className="topic-create-row">
              <input autoFocus value={topicName} onChange={(event) => setTopicName(event.target.value)} onKeyDown={(event) => {
                if (event.key === "Enter") { event.preventDefault(); createTopic(); }
                if (event.key === "Escape") { event.preventDefault(); setTopicName(""); setTopicCreatorOpen(false); }
              }} placeholder="Название темы" maxLength={60} />
              <button type="button" className="icon-button" onClick={createTopic} disabled={!topicName.trim()} aria-label="Добавить тему"><Icon name="check" size={18} /></button>
            </div>
          )}
        </div>
        <label className="editor-field">
          <span>Промпт</span>
          <FormatToolbar textareaRef={textareaRef} value={draft.content} onChange={(content) => setDraft({ ...draft, content })} />
          <textarea ref={textareaRef} value={draft.content} onChange={(event) => setDraft({ ...draft, content: event.target.value })} placeholder="Вставьте или напишите промпт…" />
        </label>
        <div className="preview-input">
          <div className="preview-input-heading"><span>Превью</span>{draft.image && <button type="button" onClick={() => setDraft({ ...draft, image: null, imagePath: null })}>Удалить</button>}</div>
          {draft.image ? <img src={draft.image} alt="Превью промпта" /> : (
            <button type="button" className="paste-zone" onClick={() => fileRef.current?.click()}><Icon name="photo" size={22} /><strong>Вставьте изображение</strong><small>⌘V или выберите файл</small></button>
          )}
          <input ref={fileRef} type="file" accept="image/*" hidden onChange={(event) => readImage(event.target.files?.[0])} />
        </div>
        <div className="form-footer">
          {mode === "edit" ? <span className={`save-status${saved ? " visible" : ""}`}><Icon name="check" size={15} />Сохранено</span> : (
            <button className="primary-button" type="submit" disabled={!draft.title.trim() || !draft.content.trim()}>Сохранить <span>⌘↵</span></button>
          )}
        </div>
      </form>
    </aside>
  );
}

function DetailPanel({ prompt, copied, onClose, onCopy, onEdit, onFavorite, onDelete }) {
  return (
    <aside className="detail-panel">
      <div className="panel-header">
        <div><h2>{prompt.title}</h2><span className="panel-topic"><Icon name="folder" size={16} />{prompt.topic}</span></div>
        <div className="panel-header-actions"><button className="icon-button" onClick={onClose} aria-label="Закрыть"><Icon name="close" size={22} /></button></div>
      </div>
      <div className="panel-actions"><button className={`copy-primary${copied ? " copied" : ""}`} onClick={() => onCopy(prompt)}><Icon name={copied ? "check" : "copy"} size={18} light />{copied ? "Скопировано" : "Скопировать"}</button><button className="secondary-button" onClick={onEdit}><Icon name="pencil" size={18} />Редактировать</button></div>
      <div className="panel-divider" /><p className="section-label">Промпт</p><PromptBody content={prompt.content} />
      {prompt.image && <><div className="panel-divider" /><p className="section-label">Предварительный просмотр</p><img className="detail-preview" src={prompt.image} alt="Превью промпта" /></>}
      <button className="delete-button" onClick={() => onDelete(prompt.id)}><Icon name="trash" size={16} />Удалить промпт</button>
    </aside>
  );
}

function AuthScreen() {
  const [email, setEmail] = useState("");
  const [state, setState] = useState("idle");
  const [message, setMessage] = useState("");

  const submit = async (event) => {
    event.preventDefault();
    if (!email.trim()) return;
    setState("sending");
    setMessage("");
    const { error } = await supabase.auth.signInWithOtp({
      email: email.trim(),
      options: {
        shouldCreateUser: false,
        emailRedirectTo: window.location.href.split("#")[0],
      },
    });
    if (error) {
      setState("error");
      setMessage("Не удалось отправить ссылку. Проверьте почту или попробуйте позже.");
      return;
    }
    setState("sent");
    setMessage("Ссылка для входа отправлена на вашу почту.");
  };

  return (
    <main className="auth-screen">
      <form className="auth-card" onSubmit={submit}>
        <div className="brand">Quiet Shelf</div>
        <div>
          <h1>Вход в библиотеку</h1>
          <p>Введите личную почту. Мы пришлём одноразовую ссылку для входа.</p>
        </div>
        <label><span>Почта</span><input type="email" autoComplete="email" value={email} onChange={(event) => setEmail(event.target.value)} placeholder="name@example.com" required /></label>
        <button className="primary-button" type="submit" disabled={state === "sending"}>{state === "sending" ? "Отправляем…" : "Получить ссылку"}</button>
        {message && <p className={`auth-message ${state}`} role="status">{message}</p>}
      </form>
    </main>
  );
}

function useCloudLibrary(session) {
  const [library, setLibrary] = useState(emptyLibrary);
  const [ready, setReady] = useState(false);
  const [storageStatus, setStorageStatus] = useState("loading");
  const saveQueue = useRef(Promise.resolve());
  const version = useRef(0);

  useEffect(() => {
    if (!session?.user?.id) return undefined;
    let active = true;
    setReady(false);
    setStorageStatus("loading");

    (async () => {
      try {
        let next = await loadCloudLibrary(session.user.id);
        if (!next) {
          next = readLegacyLibrary();
          next = await saveCloudLibrary(session.user.id, next);
        }
        if (!active) return;
        setLibrary(next);
        setReady(true);
        setStorageStatus("saved");
      } catch (error) {
        console.error("Cloud library load failed", error);
        if (!active) return;
        setStorageStatus("error");
      }
    })();

    return () => { active = false; };
  }, [session?.user?.id]);

  useEffect(() => {
    if (!ready || !session?.user?.id) return;
    const currentVersion = ++version.current;
    const snapshot = library;
    const hasPendingImages = [...snapshot.prompts, ...snapshot.trash].some((prompt) => prompt.image?.startsWith("data:image/"));
    setStorageStatus("saving");

    saveQueue.current = saveQueue.current
      .catch(() => undefined)
      .then(() => saveCloudLibrary(session.user.id, snapshot))
      .then((prepared) => {
        if (currentVersion !== version.current) return;
        if (hasPendingImages) setLibrary(prepared);
        setStorageStatus("saved");
      })
      .catch((error) => {
        console.error("Cloud library save failed", error);
        if (currentVersion === version.current) setStorageStatus("error");
      });
  }, [library, ready, session?.user?.id]);

  const setPart = useCallback((part, update) => {
    setLibrary((current) => ({
      ...current,
      [part]: typeof update === "function" ? update(current[part]) : update,
    }));
  }, []);

  return {
    prompts: library.prompts,
    topics: library.topics,
    trash: library.trash,
    setPrompts: useCallback((update) => setPart("prompts", update), [setPart]),
    setTopics: useCallback((update) => setPart("topics", update), [setPart]),
    setTrash: useCallback((update) => setPart("trash", update), [setPart]),
    ready,
    storageStatus,
  };
}

export function App() {
  const [session, setSession] = useState(undefined);
  const { prompts, topics, trash, setPrompts, setTopics, setTrash, ready, storageStatus } = useCloudLibrary(session);
  const [activeView, setActiveView] = useState("all");
  const [selectedId, setSelectedId] = useState(null);
  const [panelMode, setPanelMode] = useState("closed");
  const [search, setSearch] = useState("");
  const [sort, setSort] = useState("recent");
  const [copiedId, setCopiedId] = useState(null);
  const [infoOpen, setInfoOpen] = useState(false);
  const [newTopicOpen, setNewTopicOpen] = useState(false);
  const [newTopic, setNewTopic] = useState("");
  const [dragTopic, setDragTopic] = useState(null);
  const [topicMenu, setTopicMenu] = useState(null);
  const [renamingTopic, setRenamingTopic] = useState(null);
  const [topicRename, setTopicRename] = useState("");
  const searchRef = useRef(null);
  const selectedPrompt = prompts.find((prompt) => prompt.id === selectedId) || null;

  useEffect(() => {
    let active = true;
    supabase.auth.getSession().then(({ data }) => {
      if (active) setSession(data.session || null);
    });
    const { data: subscription } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      if (active) setSession(nextSession);
    });
    return () => {
      active = false;
      subscription.subscription.unsubscribe();
    };
  }, []);

  useEffect(() => {
    const promptTopics = prompts.map((prompt) => prompt.topic).filter((topic) => topic && topic !== "Без темы");
    setTopics((current) => {
      const next = [...current];
      promptTopics.forEach((topic) => {
        if (!next.some((item) => item.toLocaleLowerCase("ru") === topic.toLocaleLowerCase("ru"))) next.push(topic);
      });
      return next.length === current.length ? current : next;
    });
  }, [prompts, setTopics]);

  const visiblePrompts = useMemo(() => {
    if (activeView === "trash") return [...trash].sort((a, b) => b.deletedAt - a.deletedAt);
    const query = search.trim().toLocaleLowerCase("ru");
    const list = prompts.filter((prompt) => {
      if (activeView === "favorites" && !prompt.favorite) return false;
      if (topics.includes(activeView) && prompt.topic !== activeView) return false;
      return !query || `${prompt.title} ${prompt.content}`.toLocaleLowerCase("ru").includes(query);
    });
    return [...list].sort((a, b) => {
      if (a.favorite !== b.favorite && topics.includes(activeView)) return a.favorite ? -1 : 1;
      if (sort === "alphabet") return a.title.localeCompare(b.title, "ru");
      return b.updatedAt - a.updatedAt;
    });
  }, [activeView, prompts, search, sort, topics, trash]);

  useEffect(() => {
    const onKeyDown = (event) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") { event.preventDefault(); searchRef.current?.focus(); }
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "n") { event.preventDefault(); setPanelMode("create"); setSelectedId(null); }
      if (event.key === "Escape") {
        setInfoOpen(false);
        setTopicMenu(null);
        setRenamingTopic(null);
        if (panelMode !== "closed") setPanelMode("closed");
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [panelMode]);

  useEffect(() => {
    if (!topicMenu) return undefined;
    const closeMenu = (event) => {
      if (!event.target.closest("[data-topic-menu]")) setTopicMenu(null);
    };
    window.addEventListener("pointerdown", closeMenu);
    return () => window.removeEventListener("pointerdown", closeMenu);
  }, [topicMenu]);

  const copyPrompt = async (prompt) => {
    try { await navigator.clipboard.writeText(prompt.content); setCopiedId(prompt.id); window.setTimeout(() => setCopiedId(null), 1400); } catch { setCopiedId(null); }
  };
  const toggleFavorite = (id) => setPrompts((items) => items.map((item) => item.id === id ? { ...item, favorite: !item.favorite } : item));
  const openPrompt = (id) => { setSelectedId(id); setPanelMode("detail"); };
  const createPrompt = (draft) => {
    const id = Date.now();
    if (draft.topic && draft.topic !== "Без темы") {
      setTopics((items) => items.some((item) => item.toLocaleLowerCase("ru") === draft.topic.toLocaleLowerCase("ru")) ? items : [...items, draft.topic]);
    }
    setPrompts((items) => [{ ...draft, id, favorite: false, updatedAt: Date.now() }, ...items]);
    setSelectedId(id); setPanelMode("detail"); setActiveView("all");
  };
  const updatePrompt = useCallback((id, draft) => {
    setPrompts((items) => items.map((item) => item.id === id ? { ...item, ...draft, updatedAt: Date.now() } : item));
  }, []);
  const deletePrompt = (id) => {
    const target = prompts.find((item) => item.id === id);
    if (target) setTrash((items) => [{ ...target, deletedAt: Date.now() }, ...items]);
    setPrompts((items) => items.filter((item) => item.id !== id));
    setSelectedId(null); setPanelMode("closed");
  };
  const restorePrompt = (id) => {
    const target = trash.find((item) => item.id === id);
    if (!target) return;
    const { deletedAt, ...restored } = target;
    setPrompts((items) => [{ ...restored, updatedAt: Date.now() }, ...items]);
    setTrash((items) => items.filter((item) => item.id !== id));
  };
  const addTopic = (event) => {
    event.preventDefault();
    const value = newTopic.trim();
    if (value && !topics.includes(value)) setTopics((items) => [...items, value]);
    setNewTopic(""); setNewTopicOpen(false);
  };
  const addTopicFromEditor = (name) => {
    const value = name.trim();
    if (!value) return null;
    const existing = topics.find((topic) => topic.toLocaleLowerCase("ru") === value.toLocaleLowerCase("ru"));
    if (existing) return existing;
    setTopics((items) => [...items, value]);
    return value;
  };
  const reorderTopic = (target) => {
    if (!dragTopic || dragTopic === target) return;
    setTopics((items) => { const next = items.filter((item) => item !== dragTopic); next.splice(next.indexOf(target), 0, dragTopic); return next; });
    setDragTopic(null);
  };
  const startTopicRename = (topic) => {
    setTopicMenu(null);
    setRenamingTopic(topic);
    setTopicRename(topic);
  };
  const saveTopicRename = (event) => {
    event?.preventDefault();
    const value = topicRename.trim();
    if (!renamingTopic || !value) return;
    const duplicate = topics.some((topic) => topic !== renamingTopic && topic.toLocaleLowerCase("ru") === value.toLocaleLowerCase("ru"));
    if (duplicate) return;
    setTopics((items) => items.map((topic) => topic === renamingTopic ? value : topic));
    setPrompts((items) => items.map((prompt) => prompt.topic === renamingTopic ? { ...prompt, topic: value, updatedAt: Date.now() } : prompt));
    setTrash((items) => items.map((prompt) => prompt.topic === renamingTopic ? { ...prompt, topic: value } : prompt));
    if (activeView === renamingTopic) setActiveView(value);
    setRenamingTopic(null);
    setTopicRename("");
  };
  const deleteTopic = (topic) => {
    setTopics((items) => items.filter((item) => item !== topic));
    setPrompts((items) => items.map((prompt) => prompt.topic === topic ? { ...prompt, topic: "Без темы", updatedAt: Date.now() } : prompt));
    setTrash((items) => items.map((prompt) => prompt.topic === topic ? { ...prompt, topic: "Без темы" } : prompt));
    if (activeView === topic) setActiveView("all");
    setTopicMenu(null);
    if (renamingTopic === topic) setRenamingTopic(null);
  };

  if (session === undefined) return <main className="auth-screen"><div className="auth-loading">Загружаем библиотеку…</div></main>;
  if (!session) return <AuthScreen />;
  if (!ready) {
    return (
      <main className="auth-screen">
        <div className={`auth-loading ${storageStatus === "error" ? "error" : ""}`}>
          {storageStatus === "error" ? "Не удалось открыть облачную библиотеку." : "Загружаем библиотеку…"}
        </div>
      </main>
    );
  }

  const currentTitle = activeView === "all" ? "Промпты" : activeView === "favorites" ? "Избранное" : activeView === "trash" ? "Корзина" : activeView;

  return (
    <div className={`app-shell${panelMode !== "closed" ? " has-panel" : ""}`}>
      <aside className="sidebar">
        <div className="brand">Quiet Shelf</div>
        <label className="search-field"><Icon name="search" size={19} /><input ref={searchRef} value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Поиск промптов" /><kbd>⌘K</kbd></label>
        <button className="new-prompt-button" onClick={() => { setSelectedId(null); setPanelMode("create"); }}><Icon name="plus" size={20} light />Новый промпт</button>
        <nav className="main-nav" aria-label="Библиотека">
          <button className={activeView === "all" ? "active" : ""} onClick={() => setActiveView("all")}><Icon name="grid" size={19} />Все промпты</button>
          <button className={activeView === "favorites" ? "active" : ""} onClick={() => setActiveView("favorites")}><Icon name="star" size={19} />Избранное</button>
        </nav>
        <div className="topics-heading"><span>Мои темы</span><button onClick={() => setNewTopicOpen((value) => !value)} aria-label="Добавить тему"><Icon name="plus" size={16} /></button></div>
        {newTopicOpen && <form className="new-topic-form" onSubmit={addTopic}><input autoFocus value={newTopic} onChange={(event) => setNewTopic(event.target.value)} placeholder="Название темы" /></form>}
        <nav className="topic-nav" aria-label="Темы">
          {topics.map((topic) => (
            <div key={topic} className={`topic-item${activeView === topic ? " active" : ""}`} draggable={renamingTopic !== topic} onDragStart={() => setDragTopic(topic)} onDragOver={(event) => event.preventDefault()} onDrop={() => reorderTopic(topic)} data-topic-menu>
              {renamingTopic === topic ? (
                <form className="topic-rename-form" onSubmit={saveTopicRename}>
                  <input autoFocus value={topicRename} onChange={(event) => setTopicRename(event.target.value)} onKeyDown={(event) => {
                    if (event.key === "Escape") { event.stopPropagation(); setRenamingTopic(null); setTopicRename(""); }
                  }} aria-label="Новое название темы" maxLength={60} />
                  <button type="submit" aria-label="Сохранить название" disabled={!topicRename.trim()}><Icon name="check" size={16} /></button>
                  <button type="button" aria-label="Отменить переименование" onClick={() => { setRenamingTopic(null); setTopicRename(""); }}><Icon name="close" size={16} /></button>
                </form>
              ) : (
                <>
                  <button className="topic-select" onClick={() => { setActiveView(topic); setTopicMenu(null); }}><Icon name="folder" size={18} /><span>{topic}</span></button>
                  <button className="topic-menu-button" onClick={() => setTopicMenu((current) => current === topic ? null : topic)} aria-label={`Меню темы «${topic}»`} aria-haspopup="menu" aria-expanded={topicMenu === topic}><Icon name="grip" size={17} /></button>
                  {topicMenu === topic && (
                    <div className="topic-actions" role="menu">
                      <button type="button" role="menuitem" onClick={() => startTopicRename(topic)}><Icon name="pencil" size={16} />Переименовать</button>
                      <button type="button" role="menuitem" className="danger" onClick={() => deleteTopic(topic)}><Icon name="trash" size={16} />Удалить тему</button>
                    </div>
                  )}
                </>
              )}
            </div>
          ))}
        </nav>
        <div className="sidebar-bottom">
          <div className={`cloud-status ${storageStatus}`} role="status">
            <span />{storageStatus === "saving" ? "Сохраняем…" : storageStatus === "error" ? "Не сохранено" : "Сохранено в облаке"}
          </div>
          <button className={`trash-link${activeView === "trash" ? " active" : ""}`} title={`${trash.length} удалено`} onClick={() => { setActiveView("trash"); setPanelMode("closed"); }}><Icon name="trash" size={17} />Корзина{trash.length > 0 && <span>{trash.length}</span>}</button>
          <button className="info-button" onClick={() => setInfoOpen((value) => !value)}><Icon name="info" size={19} />Инфо<span>⌘/</span></button>
          {infoOpen && <div className="info-popover"><strong>Сочетания клавиш</strong><div><span>Поиск</span><kbd>⌘K</kbd></div><div><span>Новый промпт</span><kbd>⌘N</kbd></div><div><span>Сохранить</span><kbd>⌘↵</kbd></div><div><span>Закрыть панель</span><kbd>Esc</kbd></div><p>Личная библиотека. Доступ только владельцу.</p></div>}
        </div>
      </aside>
      <main className="library">
        <header className="library-header"><div><h1>{currentTitle}</h1><p>{visiblePrompts.length} промптов</p></div><label className="sort-control"><span>Сначала</span><select value={sort} onChange={(event) => setSort(event.target.value)}><option value="recent">новые</option><option value="alphabet">по алфавиту</option></select><Icon name="chevron" size={15} /></label></header>
        {activeView === "trash" ? (
          trash.length > 0 ? <section className="trash-list" aria-label="Удалённые промпты">{trash.map((prompt) => <article className="trash-item" key={prompt.id}><div><h3>{prompt.title}</h3><span><Icon name="folder" size={15} />{prompt.topic}</span></div><button className="secondary-button" onClick={() => restorePrompt(prompt.id)}>Восстановить</button></article>)}</section> : <div className="empty-state"><h2>Корзина пуста</h2><p>Удалённые промпты появятся здесь.</p></div>
        ) : visiblePrompts.length > 0 ? <section className="prompt-grid" aria-label="Промпты">{visiblePrompts.map((prompt) => <PromptCard key={prompt.id} prompt={prompt} selected={prompt.id === selectedId && panelMode !== "closed"} copied={copiedId === prompt.id} onOpen={openPrompt} onCopy={copyPrompt} onFavorite={toggleFavorite} />)}</section> : <div className="empty-state"><h2>{search ? "Ничего не найдено" : "Здесь пока нет промптов"}</h2><p>{search ? "Попробуйте изменить запрос." : "Добавьте первый промпт в эту тему."}</p>{!search && <button className="primary-button" onClick={() => setPanelMode("create")}>Создать промпт</button>}</div>}
      </main>
      {panelMode === "detail" && selectedPrompt && <DetailPanel prompt={selectedPrompt} copied={copiedId === selectedPrompt.id} onClose={() => setPanelMode("closed")} onCopy={copyPrompt} onEdit={() => setPanelMode("edit")} onFavorite={toggleFavorite} onDelete={deletePrompt} />}
      {(panelMode === "create" || panelMode === "edit") && <EditorPanel key={`${panelMode}-${selectedId || "new"}`} mode={panelMode} prompt={selectedPrompt} topics={topics} onClose={() => setPanelMode(selectedPrompt ? "detail" : "closed")} onCreate={createPrompt} onUpdate={updatePrompt} onAddTopic={addTopicFromEditor} />}
    </div>
  );
}
