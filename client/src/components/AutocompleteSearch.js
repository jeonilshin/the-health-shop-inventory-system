import React, { useState, useEffect, useRef, useContext } from 'react';
import api from '../utils/api';
import { formatQuantity, formatPrice } from '../utils/formatNumber';
import { AuthContext } from '../context/AuthContext';
import { FiSearch, FiPackage } from 'react-icons/fi';

function AutocompleteSearch({ locationId, onSelect, placeholder = "Search product..." }) {
  const { user } = useContext(AuthContext);
  const [searchTerm, setSearchTerm] = useState('');
  const [results, setResults] = useState([]);
  const [isLoading, setIsLoading] = useState(false);
  const [showResults, setShowResults] = useState(false);
  const [selectedIndex, setSelectedIndex] = useState(-1);
  const wrapperRef = useRef(null);
  const inputRef = useRef(null);

  // Close dropdown when clicking outside
  useEffect(() => {
    function handleClickOutside(event) {
      if (wrapperRef.current && !wrapperRef.current.contains(event.target)) {
        setShowResults(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Search with debounce
  useEffect(() => {
    const delayDebounce = setTimeout(() => {
      if (searchTerm.length >= 3) {
        searchProducts();
      } else {
        setResults([]);
        setShowResults(false);
      }
    }, 300);

    return () => clearTimeout(delayDebounce);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchTerm, locationId]);

  const searchProducts = async () => {
    try {
      setIsLoading(true);
      const params = new URLSearchParams({ q: searchTerm });
      if (locationId) {
        params.append('location_id', locationId);
      }
      const response = await api.get(`/search/inventory?${params}`);
      setResults(response.data);
      setShowResults(true);
      setSelectedIndex(-1);
    } catch (error) {
      console.error('Search error:', error);
      setResults([]);
    } finally {
      setIsLoading(false);
    }
  };

  const handleSelect = (item) => {
    onSelect(item);
    setSearchTerm('');
    setResults([]);
    setShowResults(false);
    setSelectedIndex(-1);
  };

  const handleKeyDown = (e) => {
    if (!showResults || results.length === 0) return;

    switch (e.key) {
      case 'ArrowDown':
        e.preventDefault();
        setSelectedIndex(prev => 
          prev < results.length - 1 ? prev + 1 : prev
        );
        break;
      case 'ArrowUp':
        e.preventDefault();
        setSelectedIndex(prev => prev > 0 ? prev - 1 : -1);
        break;
      case 'Enter':
        e.preventDefault();
        if (selectedIndex >= 0 && selectedIndex < results.length) {
          handleSelect(results[selectedIndex]);
        }
        break;
      case 'Escape':
        setShowResults(false);
        setSelectedIndex(-1);
        break;
      default:
        break;
    }
  };

  const highlightMatch = (text, query) => {
    if (!query) return text;
    const parts = text.split(new RegExp(`(${query})`, 'gi'));
    return parts.map((part, index) => 
      part.toLowerCase() === query.toLowerCase() ? 
        <strong key={index} style={{ backgroundColor: '#fef3c7', color: '#92400e' }}>{part}</strong> : 
        part
    );
  };

  return (
    <div ref={wrapperRef} style={{ position: 'relative', width: '100%' }}>
      <div style={{ position: 'relative' }}>
        <FiSearch 
          style={{ 
            position: 'absolute', 
            left: '12px', 
            top: '50%', 
            transform: 'translateY(-50%)', 
            color: 'var(--text-muted)',
            pointerEvents: 'none'
          }} 
          size={18} 
        />
        <input
          ref={inputRef}
          type="text"
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          onKeyDown={handleKeyDown}
          onFocus={() => searchTerm.length >= 3 && setShowResults(true)}
          placeholder={placeholder}
          style={{ 
            width: '100%', 
            paddingLeft: '40px',
            paddingRight: '12px'
          }}
        />
      </div>

      {showResults && (
        <div style={{
          position: 'absolute',
          top: '100%',
          left: 0,
          right: 0,
          backgroundColor: 'var(--card-bg)',
          border: '2px solid var(--primary)',
          borderRadius: 'var(--radius-md)',
          boxShadow: 'var(--shadow-lg)',
          maxHeight: '400px',
          overflowY: 'auto',
          zIndex: 1000,
          marginTop: '4px'
        }}>
          {isLoading ? (
            <div style={{ padding: '16px', textAlign: 'center', color: 'var(--text-secondary)' }}>
              Searching...
            </div>
          ) : results.length === 0 ? (
            <div style={{ padding: '16px', textAlign: 'center', color: 'var(--text-secondary)' }}>
              <FiPackage size={32} style={{ opacity: 0.3, marginBottom: '8px' }} />
              <div>No products found</div>
              <div style={{ fontSize: '12px', marginTop: '4px' }}>
                Try a different search term
              </div>
            </div>
          ) : (
            results.map((item, index) => (
              <div
                key={item.id}
                onClick={() => handleSelect(item)}
                onMouseEnter={() => setSelectedIndex(index)}
                style={{
                  padding: '12px 16px',
                  cursor: 'pointer',
                  backgroundColor: selectedIndex === index ? 'var(--bg-primary)' : 'transparent',
                  borderBottom: index < results.length - 1 ? '1px solid var(--border-light)' : 'none',
                  transition: 'background-color 0.15s ease'
                }}
              >
                <div style={{ 
                  display: 'flex', 
                  justifyContent: 'space-between', 
                  alignItems: 'flex-start',
                  gap: '12px'
                }}>
                  <div style={{ flex: 1 }}>
                    <div style={{ 
                      fontWeight: 600, 
                      color: 'var(--text-primary)',
                      marginBottom: '4px'
                    }}>
                      {highlightMatch(item.description, searchTerm)}
                    </div>
                    <div style={{ 
                      fontSize: '12px', 
                      color: 'var(--text-secondary)',
                      display: 'flex',
                      gap: '12px',
                      flexWrap: 'wrap'
                    }}>
                      <span>
                        <FiPackage size={12} style={{ marginRight: '4px', verticalAlign: 'middle' }} />
                        {formatQuantity(item.quantity)} {item.unit}
                      </span>
                      {user.role === 'admin' && item.unit_cost && (
                        <span>₱{formatPrice(item.unit_cost)}</span>
                      )}
                      {item.batch_number && (
                        <span>Batch: {item.batch_number}</span>
                      )}
                      {item.expiry_date && (
                        <span style={{ 
                          color: new Date(item.expiry_date) < new Date() ? '#ef4444' : 
                                 new Date(item.expiry_date) < new Date(Date.now() + 30*24*60*60*1000) ? '#f59e0b' : 
                                 'inherit'
                        }}>
                          Exp: {new Date(item.expiry_date).toLocaleDateString()}
                        </span>
                      )}
                    </div>
                  </div>
                  {!locationId && (
                    <div style={{
                      fontSize: '11px',
                      padding: '2px 8px',
                      borderRadius: 'var(--radius-full)',
                      backgroundColor: 'var(--bg-secondary)',
                      color: 'var(--text-secondary)',
                      whiteSpace: 'nowrap'
                    }}>
                      {item.location_name}
                    </div>
                  )}
                </div>
              </div>
            ))
          )}
        </div>
      )}
    </div>
  );
}

export default AutocompleteSearch;
